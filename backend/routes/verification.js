const express = require('express');
const router = express.Router();
const { Ambulance, Hospital, User, AuditLog } = require('../utils/db');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * @route GET /api/admin/pending-verifications
 * @desc Get list of all pending ambulance and hospital registration requests for War Room verification
 */
router.get('/pending-verifications', verifyToken(), async (req, res) => {
  try {
    let pendingAmbulances = [];
    try {
      pendingAmbulances = await Ambulance.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { verification_status: 'PENDING' },
            { is_active: false }
          ]
        },
        order: [['createdAt', 'DESC']]
      });
    } catch (e) {
      pendingAmbulances = await Ambulance.findAll({
        where: { is_active: false },
        order: [['createdAt', 'DESC']]
      });
    }

    let pendingHospitals = [];
    try {
      pendingHospitals = await Hospital.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { verification_status: 'PENDING' },
            { is_active: false }
          ]
        },
        order: [['createdAt', 'DESC']]
      });
    } catch (e) {
      pendingHospitals = await Hospital.findAll({
        where: { is_active: false },
        order: [['createdAt', 'DESC']]
      });
    }

    return res.json({
      success: true,
      pendingAmbulances,
      pendingHospitals
    });
  } catch (err) {
    console.error('[VERIFICATION ERROR] Failed to fetch pending units:', err);
    return res.status(500).json({ error: 'Failed to fetch pending registration verifications' });
  }
});

/**
 * @route POST /api/admin/approve-unit
 * @desc Approve a pending ambulance or hospital registration request
 */
router.post('/approve-unit', verifyToken(), async (req, res) => {
  const { unitId, unitType } = req.body;
  if (!unitId || !unitType) {
    return res.status(400).json({ error: 'unitId and unitType (ambulance|hospital) are required' });
  }

  try {
    const reqio = req.app.get('io');
    if (unitType === 'ambulance') {
      const ambulance = await Ambulance.findByPk(unitId);
      if (!ambulance) return res.status(404).json({ error: 'Ambulance record not found' });

      ambulance.is_active = true;
      ambulance.verification_status = 'APPROVED';
      await ambulance.save();

      // Also activate corresponding paramedic user account
      const normalizedEmail = `${ambulance.vehicleNo.replace(/[\s\-]+/g, '').toLowerCase()}@rescuelink.com`;
      const user = await User.findOne({ where: { email: normalizedEmail } });
      if (user) {
        user.is_active = true;
        await user.save();
      }

      await AuditLog.create({
        user_id: req.user.id,
        action: 'AMBULANCE_REGISTRATION_APPROVED',
        resource: 'Ambulance',
        resource_id: ambulance.id,
        details: { vehicleNo: ambulance.vehicleNo, approvedBy: req.user.email }
      });

      if (reqio) {
        reqio.emit('unit:verified', { unitId: ambulance.id, unitType: 'ambulance', status: 'APPROVED', vehicleNo: ambulance.vehicleNo });
      }

      return res.json({ success: true, message: `Ambulance ${ambulance.vehicleNo} approved successfully and activated on system.` });
    } else if (unitType === 'hospital') {
      const hospital = await Hospital.findByPk(unitId);
      if (!hospital) return res.status(404).json({ error: 'Hospital record not found' });

      hospital.is_active = true;
      hospital.verification_status = 'APPROVED';
      await hospital.save();

      // Activate corresponding hospital admin user account
      const users = await User.findAll({ where: { hospital_id: hospital.id } });
      for (const u of users) {
        u.is_active = true;
        await u.save();
      }

      await AuditLog.create({
        user_id: req.user.id,
        action: 'HOSPITAL_REGISTRATION_APPROVED',
        resource: 'Hospital',
        resource_id: hospital.id,
        details: { name: hospital.name, approvedBy: req.user.email }
      });

      if (reqio) {
        reqio.emit('unit:verified', { unitId: hospital.id, unitType: 'hospital', status: 'APPROVED', name: hospital.name });
      }

      return res.json({ success: true, message: `Hospital ${hospital.name} approved successfully and activated on system.` });
    } else {
      return res.status(400).json({ error: 'Invalid unitType' });
    }
  } catch (err) {
    console.error('[VERIFICATION ERROR] Failed to approve unit:', err);
    return res.status(500).json({ error: 'Failed to approve unit registration' });
  }
});

/**
 * @route POST /api/admin/reject-unit
 * @desc Reject a pending ambulance or hospital registration request
 */
router.post('/reject-unit', verifyToken(), async (req, res) => {
  const { unitId, unitType, reason } = req.body;
  if (!unitId || !unitType) {
    return res.status(400).json({ error: 'unitId and unitType are required' });
  }

  try {
    const reqio = req.app.get('io');
    if (unitType === 'ambulance') {
      const ambulance = await Ambulance.findByPk(unitId);
      if (!ambulance) return res.status(404).json({ error: 'Ambulance record not found' });

      ambulance.is_active = false;
      ambulance.verification_status = 'REJECTED';
      await ambulance.save();

      if (reqio) {
        reqio.emit('unit:verified', { unitId: ambulance.id, unitType: 'ambulance', status: 'REJECTED', reason });
      }

      return res.json({ success: true, message: `Ambulance ${ambulance.vehicleNo} registration rejected.` });
    } else if (unitType === 'hospital') {
      const hospital = await Hospital.findByPk(unitId);
      if (!hospital) return res.status(404).json({ error: 'Hospital record not found' });

      hospital.is_active = false;
      hospital.verification_status = 'REJECTED';
      await hospital.save();

      if (reqio) {
        reqio.emit('unit:verified', { unitId: hospital.id, unitType: 'hospital', status: 'REJECTED', reason });
      }

      return res.json({ success: true, message: `Hospital ${hospital.name} registration rejected.` });
    } else {
      return res.status(400).json({ error: 'Invalid unitType' });
    }
  } catch (err) {
    console.error('[VERIFICATION ERROR] Failed to reject unit:', err);
    return res.status(500).json({ error: 'Failed to reject unit registration' });
  }
});

module.exports = router;
