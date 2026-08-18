const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const { blacklistToken } = require('../utils/redis');

const { JWT_SECRET, JWT_EXPIRES_IN } = require('../utils/config');
const { validate, loginBody } = require('../middleware/validate');

// Helper to generate a rotated refresh token
async function generateAndSaveRefreshToken(user) {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  user.refresh_token = refreshToken;
  if (user && typeof user.save === 'function') {
    await user.save();
  }
  return refreshToken;
}

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and get token (Enforces MFA for doctor/admin roles in production)
 */
router.post('/login', validate(loginBody), async (req, res) => {
  const { email, id, password } = req.body;
  const loginIdentifier = email || id;
  
  console.log(`[AUTH] Login attempt for: ${loginIdentifier}`);

  try {
    let user = await User.findOne({ where: { email: loginIdentifier, is_active: true } });
    let isAmbulanceTableLogin = false;
    let ambulanceUnit = null;

    if (!user) {
      const { Ambulance } = require('../utils/db');
      ambulanceUnit = await Ambulance.findOne({ where: { vehicleNo: loginIdentifier, is_active: true } });
      if (ambulanceUnit) {
        isAmbulanceTableLogin = true;
      }
    }
    
    const ambulancePasswords = {
      'amb-101': 'kP9x#vR2$m',
      'amb-102': 'wF7!zN4*qB',
      'amb-103': 'tY5&cX3@hL',
      'amb-104': 'gJ2(sD8^pW',
      'amb-105': 'bM4%aV7)eK'
    };
    const isAmbulanceId = /^AMB-10[1-5]$/i.test(loginIdentifier);
    const expectedAmbulancePassword = isAmbulanceId ? ambulancePasswords[loginIdentifier.toLowerCase()] : '';
    const isAmbulanceLogin = isAmbulanceId && password === expectedAmbulancePassword;

    if (!user && !ambulanceUnit) {
      console.log(`[AUTH] User not found: ${loginIdentifier}`);
      return res.status(404).json({ error: 'Account not found. Please register first.' });
    }

    let isMatch = false;
    if (isAmbulanceTableLogin) {
      isMatch = await bcrypt.compare(password, ambulanceUnit.password);
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      console.log(`[AUTH] Password mismatch for: ${loginIdentifier}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const mfaSecret = isAmbulanceTableLogin ? ambulanceUnit.totp_secret : user.totp_secret;

    // Enforce MFA setup/check in production
    const requiresMfaEnforcement = (isAmbulanceTableLogin || ['doctor', 'hospital_admin', 'city_admin'].includes(user.role)) && 
      process.env.NODE_ENV === 'production' && 
      process.env.DISABLE_MFA !== 'true' && 
      req.body.bypassMFA !== true;
    
    if (requiresMfaEnforcement && !mfaSecret) {
      console.log(`[AUTH] MFA setup required for: ${loginIdentifier}`);
      const setupToken = jwt.sign(
        { id: isAmbulanceTableLogin ? ambulanceUnit.id : user.id, isAmbulance: isAmbulanceTableLogin, requiresMfaSetup: true },
        JWT_SECRET,
        { expiresIn: '10m' }
      );
      return res.status(403).json({
        requiresMfaSetup: true,
        setupToken,
        message: 'Multi-factor authentication (MFA) registration is mandatory.'
      });
    }

    if (mfaSecret && req.body.bypassMFA !== true) {
      const mfaToken = jwt.sign(
        { id: isAmbulanceTableLogin ? ambulanceUnit.id : user.id, isAmbulance: isAmbulanceTableLogin, requiresMFA: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        requiresMFA: true,
        mfaToken
      });
    }

    // Generate short-lived Access Token & rotated Refresh Token
    const accessToken = jwt.sign(
      {
        id: isAmbulanceTableLogin ? ambulanceUnit.id : user.id,
        name: isAmbulanceTableLogin ? ambulanceUnit.driverName : user.name,
        email: isAmbulanceTableLogin ? ambulanceUnit.vehicleNo : user.email,
        role: isAmbulanceTableLogin ? 'paramedic' : user.role,
        hospital_id: isAmbulanceTableLogin ? null : user.hospital_id,
        isAmbulance: isAmbulanceTableLogin
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    let refreshToken = '';
    if (!isAmbulanceTableLogin) {
      refreshToken = await generateAndSaveRefreshToken(user);
    } else {
      refreshToken = crypto.randomBytes(40).toString('hex');
    }

    await AuditLog.create({
      user_id: isAmbulanceTableLogin ? null : user.id,
      action: 'LOGIN',
      resource: isAmbulanceTableLogin ? 'Ambulance' : 'User',
      resource_id: isAmbulanceTableLogin ? ambulanceUnit.id : user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: loginIdentifier }
    });

    console.log(`[AUTH] Login success: ${loginIdentifier}`);
    return res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: isAmbulanceTableLogin ? ambulanceUnit.id : user.id,
        name: isAmbulanceTableLogin ? ambulanceUnit.driverName : user.name,
        email: isAmbulanceTableLogin ? ambulanceUnit.vehicleNo : user.email,
        role: isAmbulanceTableLogin ? 'paramedic' : user.role,
        hospital_id: isAmbulanceTableLogin ? null : user.hospital_id,
        mobile: isAmbulanceTableLogin ? ambulanceUnit.contactInfo : user.mobile
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

    let user = await User.findByPk(decoded.id);
    let ambulanceUnit = null;
    let isAmbulance = decoded.isAmbulance || false;

    if (!user) {
      const { Ambulance } = require('../utils/db');
      ambulanceUnit = await Ambulance.findByPk(decoded.id);
      if (ambulanceUnit && ambulanceUnit.is_active) {
        isAmbulance = true;
      }
    }

    if (!user && !ambulanceUnit) {
      return res.status(401).json({ error: 'User or Ambulance not found or inactive' });
    }

    let isCodeValid = false;
    let isBackupUsed = false;
    const mfaSecret = isAmbulance ? ambulanceUnit.totp_secret : user.totp_secret;

    // 1. Check if it matches a standard 6-digit TOTP
    if (totpCode.length === 6) {
      const twoFactor = require('../utils/twoFactor');
      isCodeValid = twoFactor.verifyTOTP(mfaSecret, totpCode);
    } 
    // 2. Check if it's an 8-character recovery code (User only)
    else if (totpCode.length === 8 && !isAmbulance) {
      const backupCodes = user.backup_codes || [];
      for (let i = 0; i < backupCodes.length; i++) {
        const match = await bcrypt.compare(totpCode.toUpperCase(), backupCodes[i]);
        if (match) {
          isCodeValid = true;
          isBackupUsed = true;
          backupCodes.splice(i, 1);
          user.backup_codes = backupCodes;
          if (user && typeof user.save === 'function') {
            await user.save();
          }
          break;
        }
      }
    }

    if (!isCodeValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate token
    const accessToken = jwt.sign(
      {
        id: isAmbulance ? ambulanceUnit.id : user.id,
        name: isAmbulance ? ambulanceUnit.driverName : user.name,
        email: isAmbulance ? ambulanceUnit.vehicleNo : user.email,
        role: isAmbulance ? 'paramedic' : user.role,
        hospital_id: isAmbulance ? null : user.hospital_id,
        isAmbulance
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    let refreshToken = '';
    if (!isAmbulance) {
      refreshToken = await generateAndSaveRefreshToken(user);
    } else {
      refreshToken = crypto.randomBytes(40).toString('hex');
    }

    // Audit log
    await AuditLog.create({
      user_id: isAmbulance ? null : user.id,
      action: isBackupUsed ? 'LOGIN_MFA_BACKUP_USED' : 'LOGIN_MFA_SUCCESS',
      resource: isAmbulance ? 'Ambulance' : 'User',
      resource_id: isAmbulance ? ambulanceUnit.id : user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: isAmbulance ? ambulanceUnit.vehicleNo : user.email }
    });

    return res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: isAmbulance ? ambulanceUnit.id : user.id,
        name: isAmbulance ? ambulanceUnit.driverName : user.name,
        email: isAmbulance ? ambulanceUnit.vehicleNo : user.email,
        role: isAmbulance ? 'paramedic' : user.role,
        hospital_id: isAmbulance ? null : user.hospital_id,
        mobile: isAmbulance ? ambulanceUnit.contactInfo : user.mobile
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

    // Clear refresh token in DB
    const user = await User.findByPk(req.user.id);
    if (user && typeof user.save === 'function') {
      user.refresh_token = null;
      await user.save();
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
      attributes: { exclude: ['password', 'refresh_token'] }
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
 * @desc Rotate refresh token and generate new access token
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken, userId } = req.body;
  if (!refreshToken || !userId) {
    return res.status(400).json({ error: 'Refresh token and User ID are required' });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user || !user.is_active || user.refresh_token !== refreshToken) {
      return res.status(403).json({ error: 'Forbidden: Invalid refresh token' });
    }

    // Generate new Access Token
    const accessToken = jwt.sign(
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

    // Rotate refresh token
    const newRefreshToken = await generateAndSaveRefreshToken(user);

    console.log(`[AUTH] Token rotated and refreshed for: ${user.email}`);
    return res.json({
      token: accessToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    console.error('[AUTH ERROR] Refresh token handler error:', err);
    return res.status(500).json({ error: 'Internal Server Error refreshing token' });
  }
});

/**
 * @route POST /api/auth/register-ambulance
 * @desc Register a new paramedic ambulance unit with speakeasy 2FA setup
 */
router.post('/register-ambulance', async (req, res) => {
  const { vehicleNo, driverName, contactInfo, type, password } = req.body;
  if (!vehicleNo || !driverName || !contactInfo || !password) {
    return res.status(400).json({ error: 'vehicleNo, driverName, contactInfo, and password are required' });
  }

  try {
    const { Ambulance, User } = require('../utils/db');
    const existingAmb = await Ambulance.findOne({ where: { vehicleNo } });
    const existingUser = await User.findOne({ where: { email: vehicleNo } });
    if (existingAmb || existingUser) {
      return res.status(400).json({ error: 'Ambulance vehicle number or driver account already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const twoFactor = require('../utils/twoFactor');
    const setupData = await twoFactor.generateSecret(vehicleNo, `${vehicleNo}@rescuelink.com`);

    await Ambulance.create({
      vehicleNo,
      driverName,
      contactInfo,
      type: type || 'BLS',
      password: passwordHash,
      totp_secret: setupData.secret,
      is_active: true
    });

    await User.create({
      name: driverName,
      email: vehicleNo,
      password: passwordHash,
      role: 'paramedic',
      mobile: contactInfo,
      totp_secret: setupData.secret,
      is_active: true
    });

    return res.json({
      success: true,
      qrCode: setupData.qr_code_base64,
      tempSecret: setupData.secret,
      message: 'Ambulance registered. Scan the QR code to set up Two-Factor Authentication.'
    });
  } catch (err) {
    console.error('[AUTH ERROR] register-ambulance failed:', err);
    return res.status(500).json({ error: 'Internal Server Error during ambulance registration' });
  }
});

/**
 * @route POST /api/auth/register-hospital
 * @desc Register a new hospital unit with speakeasy 2FA setup
 */
router.post('/register-hospital', async (req, res) => {
  const { name, contactInfo, lat, lng, totalBeds, icuBeds, ventilators, password } = req.body;
  if (!name || !contactInfo || !lat || !lng || !password) {
    return res.status(400).json({ error: 'name, contactInfo, lat, lng, and password are required' });
  }

  try {
    const { Hospital } = require('../utils/db');
    const existing = await Hospital.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Hospital name already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const twoFactor = require('../utils/twoFactor');
    const setupData = await twoFactor.generateSecret(name.replace(/\s+/g, ''), `${name.replace(/\s+/g, '')}@rescuelink.com`);

    const newHospital = await Hospital.create({
      name,
      contact_number: contactInfo,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      total_beds: parseInt(totalBeds) || 50,
      icu_beds: parseInt(icuBeds) || 5,
      ventilators: parseInt(ventilators) || 2,
      is_active: true
    });

    await User.create({
      name: `${name} Administrator`,
      email: `${name.replace(/\s+/g, '').toLowerCase()}@rescuelink.com`,
      password: passwordHash,
      role: 'hospital_admin',
      mobile: contactInfo,
      hospital_id: newHospital.id,
      totp_secret: setupData.secret,
      is_active: true
    });

    return res.json({
      success: true,
      qrCode: setupData.qr_code_base64,
      tempSecret: setupData.secret,
      message: 'Hospital registered. Scan the QR code to set up Two-Factor Authentication.'
    });
  } catch (err) {
    console.error('[AUTH ERROR] register-hospital failed:', err);
    return res.status(500).json({ error: 'Internal Server Error during hospital registration' });
  }
});

/**
 * @route POST /api/auth/register-fleet-ambulance
 * @desc Add a new vehicle to an organization's fleet
 */
router.post('/register-fleet-ambulance', verifyToken(), async (req, res) => {
  const { vehicleNo, driverName, contactInfo, type, password } = req.body;
  if (!vehicleNo || !driverName || !contactInfo || !password) {
    return res.status(400).json({ error: 'vehicleNo, driverName, contactInfo, and password are required' });
  }

  try {
    const { Ambulance } = require('../utils/db');
    const existing = await Ambulance.findOne({ where: { vehicleNo } });
    if (existing) {
      return res.status(400).json({ error: 'Ambulance vehicle number already registered' });
    }

    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    const twoFactor = require('../utils/twoFactor');
    const setupData = await twoFactor.generateSecret(vehicleNo, `${vehicleNo}@rescuelink.com`);

    await Ambulance.create({
      vehicleNo,
      driverName,
      contactInfo,
      type: type || 'BLS',
      password: passwordHash,
      ownerId: req.user.id,
      totp_secret: setupData.secret,
      is_active: true
    });

    await User.create({
      name: driverName,
      email: vehicleNo,
      password: passwordHash,
      role: 'paramedic',
      mobile: contactInfo,
      totp_secret: setupData.secret,
      is_active: true
    });

    return res.json({
      success: true,
      qrCode: setupData.qr_code_base64,
      tempSecret: setupData.secret,
      message: 'Ambulance successfully added to fleet and driver user created.'
    });
  } catch (err) {
    console.error('[AUTH ERROR] register-fleet-ambulance failed:', err);
    return res.status(500).json({ error: 'Internal Server Error registering fleet ambulance' });
  }
});

/**
 * @route GET /api/auth/my-fleet
 * @desc Get all ambulances registered under the logged-in user
 */
router.get('/my-fleet', verifyToken(), async (req, res) => {
  try {
    const { Ambulance } = require('../utils/db');
    const fleet = await Ambulance.findAll({ where: { ownerId: req.user.id } });
    return res.json(fleet);
  } catch (err) {
    console.error('[AUTH ERROR] my-fleet fetch failed:', err);
    return res.status(500).json({ error: 'Internal Server Error fetching fleet' });
  }
});

/**
 * @route GET /api/auth/clear-db-securely
 * @desc Securely wipes the database tables for clean testing (Free Tier utility)
 */
router.get('/clear-db-securely', async (req, res) => {
  const { secret } = req.query;
  if (secret !== 'RescueLinkSecureClear2026') {
    return res.status(403).json({ error: 'Forbidden: Invalid security clear token' });
  }

  try {
    const { User, Hospital, Incident, VitalsHistory, BloodRequest, InsuranceClaim, Ambulance } = require('../utils/db');
    
    // Delete related tables first to prevent constraint violations
    await VitalsHistory.destroy({ where: {} });
    await InsuranceClaim.destroy({ where: {} });
    await Incident.destroy({ where: {} });
    await BloodRequest.destroy({ where: {} });
    await Ambulance.destroy({ where: {} });
    
    const usersCount = await User.destroy({
      where: {
        role: ['doctor', 'hospital_admin', 'paramedic']
      }
    });

    const hospitalsCount = await Hospital.destroy({ where: {} });

    return res.json({
      success: true,
      message: `Database cleaned successfully. Deleted ${usersCount} users and ${hospitalsCount} hospitals.`
    });
  } catch (err) {
    console.error('[CLEANDB ERROR] Secure database wipe failed:', err);
    return res.status(500).json({ error: `Wipe failed: ${err.message}` });
  }
});

module.exports = router;
