const express = require('express');
const router = express.Router();
const { User, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const twoFactor = require('../utils/twoFactor');
const bcrypt = require('bcryptjs');

/**
 * @route POST /api/mfa/setup
 * @desc Generate TOTP secret and QR code
 */
router.post('/setup', verifyToken(), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate secret and QR code
    const setupData = await twoFactor.generateSecret(user.id, user.email);
    
    // We return the encrypted secret to the client. The client will pass this back during /enable
    // to confirm activation. This prevents half-configured MFA locks.
    return res.json({
      qrCode: setupData.qr_code_base64,
      tempSecret: setupData.secret
    });
  } catch (err) {
    console.error('[MFA SETUP ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to generate 2FA setup' });
  }
});

/**
 * @route POST /api/mfa/enable
 * @desc Verify code and enable 2FA, generate recovery backup codes
 */
router.post('/enable', verifyToken(), async (req, res) => {
  const { code, tempSecret } = req.body;
  if (!code || !tempSecret) {
    return res.status(400).json({ error: 'MFA code and tempSecret are required' });
  }

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify token
    const isValid = twoFactor.verifyTOTP(tempSecret, code);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid authenticator code. Verification failed.' });
    }

    // Generate backup codes
    const { plainCodes, hashedCodes } = await twoFactor.generateBackupCodes();

    // Enable MFA
    user.totp_secret = tempSecret;
    user.backup_codes = hashedCodes;
    await user.save();

    // Audit log
    await AuditLog.create({
      user_id: user.id,
      action: 'MFA_ENABLED',
      resource: 'User',
      resource_id: user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: user.email }
    });

    return res.json({
      message: 'Two-factor authentication enabled successfully.',
      backupCodes: plainCodes
    });
  } catch (err) {
    console.error('[MFA ENABLE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

/**
 * @route POST /api/mfa/disable
 * @desc Disable Two-factor authentication
 */
router.post('/disable', verifyToken(), async (req, res) => {
  const { password, code } = req.body;
  if (!password || !code) {
    return res.status(400).json({ error: 'Password and MFA code are required' });
  }

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid password' });

    // Verify TOTP code
    const isValid = twoFactor.verifyTOTP(user.totp_secret, code);
    if (!isValid) return res.status(400).json({ error: 'Invalid MFA verification code' });

    // Disable MFA
    user.totp_secret = null;
    user.backup_codes = [];
    await user.save();

    // Audit log
    await AuditLog.create({
      user_id: user.id,
      action: 'MFA_DISABLED',
      resource: 'User',
      resource_id: user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: user.email }
    });

    return res.json({ message: 'Two-factor authentication disabled successfully.' });
  } catch (err) {
    console.error('[MFA DISABLE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

/**
 * @route GET /api/mfa/backup-codes
 * @desc Get remaining recovery backup codes count
 */
router.get('/backup-codes', verifyToken(), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const remainingCount = user.backup_codes ? user.backup_codes.length : 0;
    return res.json({ remainingCount });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve backup codes status' });
  }
});

module.exports = router;
