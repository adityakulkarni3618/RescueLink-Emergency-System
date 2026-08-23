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
    const { User, Ambulance } = require('../utils/db');
    let entity = null;
    let email = '';
    if (req.user.isAmbulance) {
      entity = await Ambulance.findByPk(req.user.id);
      email = entity ? entity.vehicleNo : '';
    } else {
      entity = await User.findByPk(req.user.id);
      email = entity ? entity.email : '';
    }
    if (!entity) return res.status(404).json({ error: 'Account not found' });

    // Generate secret and QR code
    const setupData = await twoFactor.generateSecret(entity.id, email);
    
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
    const { User, Ambulance } = require('../utils/db');
    let entity = null;
    if (req.user.isAmbulance) {
      entity = await Ambulance.findByPk(req.user.id);
    } else {
      entity = await User.findByPk(req.user.id);
    }
    if (!entity) return res.status(404).json({ error: 'Account not found' });

    // Verify token
    const isValid = twoFactor.verifyTOTP(tempSecret, code);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid authenticator code. Verification failed.' });
    }

    // Generate backup codes
    const { plainCodes, hashedCodes } = await twoFactor.generateBackupCodes();

    // Enable MFA
    entity.totp_secret = tempSecret;
    entity.backup_codes = hashedCodes;
    await entity.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.isAmbulance ? null : entity.id,
      action: 'MFA_ENABLED',
      resource: req.user.isAmbulance ? 'Ambulance' : 'User',
      resource_id: entity.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: req.user.isAmbulance ? entity.vehicleNo : entity.email }
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
    const { User, Ambulance } = require('../utils/db');
    let entity = null;
    if (req.user.isAmbulance) {
      entity = await Ambulance.findByPk(req.user.id);
    } else {
      entity = await User.findByPk(req.user.id);
    }
    if (!entity) return res.status(404).json({ error: 'Account not found' });

    // Verify password
    const isMatch = await bcrypt.compare(password, entity.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid password' });

    // Verify TOTP code
    const isValid = twoFactor.verifyTOTP(entity.totp_secret, code);
    if (!isValid) return res.status(400).json({ error: 'Invalid MFA verification code' });

    // Disable MFA
    entity.totp_secret = null;
    entity.backup_codes = [];
    await entity.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.isAmbulance ? null : entity.id,
      action: 'MFA_DISABLED',
      resource: req.user.isAmbulance ? 'Ambulance' : 'User',
      resource_id: entity.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: req.user.isAmbulance ? entity.vehicleNo : entity.email }
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
