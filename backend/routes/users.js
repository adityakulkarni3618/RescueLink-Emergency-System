const express = require('express');
const router = express.Router();
const { User, AuditLog, Patient, Consent } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');

/**
 * @route GET /api/users/me/incidents
 * @desc Get incident history for the authenticated patient
 */
router.get('/me/incidents', verifyToken(['patient']), async (req, res) => {
  try {
    const { Incident } = require('../utils/db');
    const incidents = await Incident.findAll({
      where: { patient_id: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    return res.json(incidents);
  } catch (err) {
    console.error('[USERS API] Error fetching patient incidents:', err.message);
    return res.status(500).json({ error: 'Failed to fetch incident history' });
  }
});

/**
 * @route GET /api/users/me/vitals-history
 * @desc Get historical vitals log for the authenticated patient
 */
router.get('/me/vitals-history', verifyToken(['patient']), async (req, res) => {
  try {
    const { VitalsHistory, Incident } = require('../utils/db');
    // Find all incidents/missions for this patient first
    const incidents = await Incident.findAll({
      where: { patient_id: req.user.id },
      attributes: ['id']
    });
    const incidentIds = incidents.map(inc => inc.id);
    
    const vitals = await VitalsHistory.findAll({
      where: { incident_id: incidentIds },
      order: [['timestamp', 'ASC']],
      limit: 100
    });
    return res.json(vitals);
  } catch (err) {
    console.error('[USERS API] Error fetching patient vitals history:', err.message);
    return res.status(500).json({ error: 'Failed to fetch vitals history' });
  }
});

/**
 * @route GET /api/users
 * @desc Get all users (Admin/Hospital staff only)
 */
router.get('/', verifyToken(['doctor', 'hospital_admin', 'city_admin']), async (req, res) => {
  try {
    const whereClause = {};
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const users = await User.findAll({
      where: whereClause,
      attributes: { exclude: ['password'] }
    });
    return res.json(users);
  } catch (err) {
    console.error('[USERS API] Error fetching users:', err.message);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 */
router.get('/:id', verifyToken(), async (req, res) => {
  try {
    // Users can only view themselves unless they are admin/hospital staff
    if (req.user.id !== req.params.id && !['doctor', 'hospital_admin', 'city_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: Cannot view other profiles' });
    }

    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role) && user.hospital_id !== req.user.hospital_id) {
      return res.status(403).json({ error: 'Access denied: User belongs to a different hospital' });
    }

    return res.json(user);
  } catch (err) {
    console.error('[USERS API] Error fetching user:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * @route POST /api/users
 * @desc Create user (City Admin only)
 */
router.post('/', verifyToken(['city_admin']), async (req, res) => {
  const { name, email, password, role, mobile, hospital_id, abha_number } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      mobile,
      hospital_id: hospital_id || null,
      abha_number: abha_number || null,
      is_active: true
    });

    // Audit Log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_USER',
      resource: 'User',
      resource_id: newUser.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: newUser.email, role: newUser.role }
    });

    const userResponse = newUser.toJSON();
    delete userResponse.password;

    return res.status(201).json(userResponse);
  } catch (err) {
    console.error('[USERS API] Error creating user:', err.message);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * @route PUT /api/users/:id
 * @desc Update user profile
 */
router.put('/:id', verifyToken(), async (req, res) => {
  try {
    // Only self or Admin can update
    if (req.user.id !== req.params.id && req.user.role !== 'city_admin') {
      return res.status(403).json({ error: 'Access denied: Cannot update other profiles' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, mobile, abha_number, is_active } = req.body;

    if (name) user.name = name;
    if (mobile) user.mobile = mobile;
    if (abha_number) user.abha_number = abha_number;
    if (is_active !== undefined && req.user.role === 'city_admin') user.is_active = is_active;

    await user.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_USER',
      resource: 'User',
      resource_id: user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { updatedFields: Object.keys(req.body) }
    });

    const userResponse = user.toJSON();
    delete userResponse.password;

    return res.json(userResponse);
  } catch (err) {
    console.error('[USERS API] Error updating user:', err.message);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * @route PUT /api/users/:id/fcm-token
 * @desc Update user FCM registration token for push notifications
 */
router.put('/:id/fcm-token', verifyToken(), async (req, res) => {
  const { fcm_token } = req.body;
  if (!fcm_token) {
    return res.status(400).json({ error: 'FCM Token is required' });
  }

  try {
    // Check if the user exists and matches the authenticated user
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied: Cannot update other users FCM token' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.fcm_token = fcm_token;
    await user.save();

    return res.json({ message: 'FCM token updated successfully' });
  } catch (err) {
    console.error('[USERS API] Error updating FCM token:', err.message);
    return res.status(500).json({ error: 'Failed to update FCM token' });
  }
});

/**
 * @route DELETE /api/users/:id
 * @desc Deactivate/Delete user (City Admin only)
 */
router.delete('/:id', verifyToken(['city_admin']), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.is_active = false;
    await user.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_USER',
      resource: 'User',
      resource_id: user.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { email: user.email }
    });

    return res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    console.error('[USERS API] Error deleting user:', err.message);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @route POST /api/users/consent/revoke
 * @desc Revoke patient consent dynamically (DPDP Act 2023 Compliance)
 */
router.post('/consent/revoke', verifyToken(), async (req, res) => {
  const { patientId } = req.body;
  if (!patientId) {
    return res.status(400).json({ error: 'Patient ID is required' });
  }

  // Patients can only revoke their own consent, unless they are city admin
  if (req.user.role === 'patient' && req.user.id !== patientId) {
    return res.status(403).json({ error: 'Access denied: Cannot revoke consent for other profiles' });
  }

  try {
    const patient = await Patient.findByPk(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    patient.consent_obtained = false;
    patient.consent_timestamp = null;
    await patient.save();

    // Append tamper-proof record to blockchain consent ledger
    const consentLedger = require('../utils/consentLedger');
    await consentLedger.appendBlock(patientId, 'CONSENT_REVOKED');

    // Mark all active consents as inactive
    if (Consent) {
      await Consent.update(
        { status: 'inactive' },
        { where: { patient_id: patientId, status: 'active' } }
      );
    }

    // Trigger real-time eviction/masking alert via Socket.io
    const io = req.app.get('socketio');
    if (io) {
      io.emit('consent-revoked', { patientId });
      console.log(`[DPDP REVOCATION] Emitted real-time eviction alert for patient: ${patientId}`);
    }

    const { logAudit } = require('../utils/auditLogger');
    await logAudit(
      'CONSENT',
      'CONSENT_REVOKED',
      { patientId, resource: 'Patient', resourceId: patientId },
      'WARNING',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({ message: 'Patient consent revoked successfully and session evicted.' });
  } catch (err) {
    console.error('[USERS API] Consent revocation error:', err.message);
    return res.status(500).json({ error: 'Failed to revoke patient consent' });
  }
});

module.exports = router;
