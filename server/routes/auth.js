const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const { blacklistToken } = require('../utils/redis');

const { JWT_SECRET, JWT_EXPIRES_IN } = require('../utils/config');

const { validate, loginBody } = require('../middleware/validate');

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and get token
 */
router.post('/login', validate(loginBody), async (req, res) => {
  const { email, id, password } = req.body;
  const loginIdentifier = email || id;
  
  console.log(`[AUTH] Login attempt for: ${loginIdentifier} (original: ${email || id})`);

  try {
    const user = await User.findOne({ where: { email: loginIdentifier, is_active: true } });
    if (!user) {
      console.log(`[AUTH] User not found: ${loginIdentifier}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log(`[AUTH] Password mismatch for: ${loginIdentifier}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user has MFA enabled
    if (user.totp_secret) {
      const mfaToken = jwt.sign(
        { id: user.id, requiresMFA: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        requiresMFA: true,
        mfaToken
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospital_id: user.hospital_id
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Write to AuditLog
    await AuditLog.create({
      user_id: user.id,
      action: 'LOGIN',
      resource: 'User',
      resource_id: user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: user.email }
    });

    console.log(`[AUTH] Login success: ${user.email} (${user.role})`);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospital_id: user.hospital_id
      }
    });
  } catch (err) {
    console.error('[AUTH ERROR] Login handler error:', err);
    return res.status(500).json({ error: 'Internal Server Error during login' });
  }
});

/**
 * @route POST /api/auth/verify-mfa
 * @desc Verify MFA code or backup recovery code
 */
router.post('/verify-mfa', async (req, res) => {
  const { mfaToken, totpCode } = req.body;
  if (!mfaToken || !totpCode) {
    return res.status(400).json({ error: 'MFA token and verification code are required' });
  }

  try {
    const decoded = jwt.verify(mfaToken, JWT_SECRET);
    if (!decoded.requiresMFA) {
      return res.status(400).json({ error: 'Invalid MFA token structure' });
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    let isCodeValid = false;
    let isBackupUsed = false;

    // 1. Check if it matches a standard 6-digit TOTP
    if (totpCode.length === 6) {
      const twoFactor = require('../utils/twoFactor');
      isCodeValid = twoFactor.verifyTOTP(user.totp_secret, totpCode);
    } 
    // 2. Check if it's an 8-character recovery code
    else if (totpCode.length === 8) {
      const backupCodes = user.backup_codes || [];
      for (let i = 0; i < backupCodes.length; i++) {
        const match = await bcrypt.compare(totpCode.toUpperCase(), backupCodes[i]);
        if (match) {
          isCodeValid = true;
          isBackupUsed = true;
          // Remove the used backup code
          backupCodes.splice(i, 1);
          user.backup_codes = backupCodes;
          await user.save();
          break;
        }
      }
    }

    if (!isCodeValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate full token
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospital_id: user.hospital_id
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Audit log
    await AuditLog.create({
      user_id: user.id,
      action: isBackupUsed ? 'LOGIN_MFA_BACKUP_USED' : 'LOGIN_MFA_SUCCESS',
      resource: 'User',
      resource_id: user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: user.email }
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospital_id: user.hospital_id
      }
    });
  } catch (err) {
    console.error('[AUTH ERROR] verify-mfa error:', err.message);
    return res.status(401).json({ error: 'MFA token has expired or is invalid' });
  }
});


/**
 * @route POST /api/auth/logout
 * @desc Revoke current token
 */
router.post('/logout', verifyToken(), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await blacklistToken(token, ttl);
        }
      }
    }

    // Write to AuditLog
    await AuditLog.create({
      user_id: req.user.id,
      action: 'LOGOUT',
      resource: 'User',
      resource_id: req.user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: req.user.email }
    });

    console.log(`[AUTH] Logout success: ${req.user.email}`);
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[AUTH ERROR] Logout handler error:', err);
    return res.status(500).json({ error: 'Internal Server Error during logout' });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get authenticated user profile
 */
router.get('/me', verifyToken(), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    return res.json(user);
  } catch (err) {
    console.error('[AUTH ERROR] Get profile handler error:', err);
    return res.status(500).json({ error: 'Internal Server Error fetching profile' });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh valid token
 */
router.post('/refresh', verifyToken(), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'Forbidden: Account deactivated' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospital_id: user.hospital_id
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`[AUTH] Token refreshed for: ${user.email}`);
    return res.json({ token });
  } catch (err) {
    console.error('[AUTH ERROR] Refresh token handler error:', err);
    return res.status(500).json({ error: 'Internal Server Error refreshing token' });
  }
});

module.exports = router;
