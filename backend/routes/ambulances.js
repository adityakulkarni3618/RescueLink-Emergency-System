const express = require('express');
const router = express.Router();
const { Ambulance, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

async function findAmbulanceByPkOrUser(idOrUuid) {
  let amb = await Ambulance.findByPk(idOrUuid);
  if (!amb) {
    const { User } = require('../utils/db');
    const user = await User.findByPk(idOrUuid);
    if (user && user.role === 'paramedic') {
      const vehiclePrefix = user.email.split('@')[0].toUpperCase();
      const { Op } = require('sequelize');
      amb = await Ambulance.findOne({
        where: {
          vehicleNo: {
            [Op.or]: [
              vehiclePrefix,
              user.email.split('@')[0]
            ]
          }
        }
      });
    }
  }
  if (!amb) {
    amb = await Ambulance.findOne({ where: { vehicleNo: idOrUuid.toUpperCase() } });
  }
  return amb;
}

/**
 * @route GET /api/ambulances
 * @desc Get all registered ambulances
 */
router.get('/', async (req, res) => {
  try {
    // Return all registered ambulances — frontend badge shows ACTIVE/ON BREAK per record
    const list = await Ambulance.findAll({
      order: [['createdAt', 'DESC']],
      raw: true
    });
    return res.json(list);
  } catch (err) {
    console.error('[AMBULANCES API] Fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch ambulances' });
  }
});

/**
 * @route POST /api/ambulances/register
 * @desc Public/Manual registration portal for ambulances
 */
router.post('/register', async (req, res) => {
  const { vehicleNo, type, driverName, contactInfo, password, ownerId } = req.body;
  if (!vehicleNo || !driverName || !password) {
    return res.status(400).json({ error: 'Vehicle number, Driver Name, and Password are required' });
  }

  try {
    const existing = await Ambulance.findOne({ where: { vehicleNo } });
    if (existing) {
      return res.status(400).json({ error: 'Ambulance vehicle number is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const ambulance = await Ambulance.create({
      vehicleNo,
      type: type || 'BLS',
      driverName,
      contactInfo: contactInfo || '',
      password: hashedPassword,
      ownerId: ownerId || null,
      is_active: false
    });

    console.log(`[REGISTRY] New ambulance registered manually: ${ambulance.vehicleNo} (${ambulance.id})`);
    return res.status(201).json({
      message: 'Ambulance registered successfully',
      id: ambulance.id,
      vehicleNo: ambulance.vehicleNo
    });
  } catch (err) {
    console.error('[AMBULANCES API] Registration failed:', err.message);
    return res.status(500).json({ error: 'Ambulance registration failed' });
  }
});

/**
 * @route PUT /api/ambulances/:id/settings
 * @desc Update ambulance settings (driver profile, availability, capability)
 */
router.put('/:id/settings', async (req, res) => {
  const { 
    driverName, type, contactInfo, is_active, vehicleNo, hospitalId, 
    equipmentChecklist, crewMembers, licenseNumber, licenseExpiry, 
    isSystemStandard, oxygenCapacityLiters 
  } = req.body;
  try {
    const amb = await findAmbulanceByPkOrUser(req.params.id);
    if (!amb) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    const oldVehicleNo = amb.vehicleNo;

    if (driverName) amb.driverName = driverName;
    if (type) amb.type = type;
    if (contactInfo) amb.contactInfo = contactInfo;
    if (is_active !== undefined) amb.is_active = is_active;
    if (vehicleNo) amb.vehicleNo = vehicleNo;
    if (hospitalId !== undefined) amb.hospital_id = hospitalId || null;
    if (equipmentChecklist !== undefined) amb.equipment_checklist = JSON.stringify(equipmentChecklist || []);
    if (crewMembers !== undefined) amb.crew_members = JSON.stringify(crewMembers || []);
    if (licenseNumber !== undefined) amb.license_number = licenseNumber || null;
    if (licenseExpiry !== undefined) amb.license_expiry = licenseExpiry || null;
    if (isSystemStandard !== undefined) amb.is_system_standard = isSystemStandard;
    if (oxygenCapacityLiters !== undefined) amb.oxygen_capacity_liters = parseInt(oxygenCapacityLiters) || 0;

    await amb.save();
    console.log(`[REGISTRY] Ambulance details updated: ${amb.vehicleNo}`);

    // Sync details to associated User table record if exists
    const { User } = require('../utils/db');
    const normalizedEmail = `${oldVehicleNo.replace(/[\s\-]+/g, '').toLowerCase()}@rescuelink.com`;
    const assocUser = await User.findOne({ where: { email: normalizedEmail } });
    if (assocUser) {
      if (driverName) assocUser.name = driverName;
      if (contactInfo) assocUser.mobile = contactInfo;
      if (is_active !== undefined) assocUser.is_active = is_active;
      if (vehicleNo && vehicleNo !== oldVehicleNo) {
        assocUser.email = `${vehicleNo.replace(/[\s\-]+/g, '').toLowerCase()}@rescuelink.com`;
      }
      await assocUser.save();
    }

    return res.json(amb);
  } catch (err) {
    console.error('[AMBULANCES API] Settings update error:', err.message);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * @route DELETE /api/ambulances/:id
 * @desc Delete an ambulance and its associated paramedic user (Admin only)
 */
router.delete('/:id', verifyToken(['city_admin']), async (req, res) => {
  try {
    const { User } = require('../utils/db');
    const amb = await Ambulance.findByPk(req.params.id);
    if (!amb) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    // Delete associated paramedic user
    const normalizedEmail = `${amb.vehicleNo.replace(/[\s\-]+/g, '').toLowerCase()}@rescuelink.com`;
    await User.destroy({ where: { email: normalizedEmail } });

    // Delete ambulance
    await amb.destroy();

    // Audit Log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_AMBULANCE',
      resource: 'Ambulance',
      resource_id: req.params.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { vehicleNo: amb.vehicleNo }
    });

    return res.json({ success: true, message: 'Ambulance and paramedic user deleted successfully' });
  } catch (err) {
    console.error('[AMBULANCES API] Delete failed:', err.message);
    return res.status(500).json({ error: 'Failed to delete ambulance' });
  }
});

/**
 * @route POST /api/ambulances/:id/change-password
 * @desc Change the login password for an ambulance unit (self or city_admin)
 */
router.post('/:id/change-password', async (req, res) => {
  try {
    const amb = await Ambulance.findByPk(req.params.id);
    if (!amb) return res.status(404).json({ error: 'Ambulance not found' });

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, amb.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    amb.password = await bcrypt.hash(newPassword, 10);
    await amb.save();

    await AuditLog.create({
      user_id: amb.id,
      action: 'CHANGE_AMBULANCE_PASSWORD',
      resource: 'Ambulance',
      resource_id: amb.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { vehicleNo: amb.vehicleNo }
    });

    return res.json({ message: 'Ambulance password updated successfully' });
  } catch (err) {
    console.error('[AMBULANCES API] change-password error:', err.message);
    return res.status(500).json({ error: 'Failed to change ambulance password' });
  }
});

/**
 * @route PUT /api/ambulances/:id/suspend
 * @desc Suspend an ambulance unit (city_admin only)
 */
router.put('/:id/suspend', verifyToken(['city_admin']), async (req, res) => {
  try {
    const amb = await Ambulance.findByPk(req.params.id);
    if (!amb) return res.status(404).json({ error: 'Ambulance not found' });

    amb.is_active = false;
    await amb.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'SUSPEND_AMBULANCE',
      resource: 'Ambulance',
      resource_id: amb.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { vehicleNo: amb.vehicleNo, reason: req.body.reason || 'Admin action' }
    });

    return res.json({ message: 'Ambulance suspended successfully', is_active: false });
  } catch (err) {
    console.error('[AMBULANCES API] suspend error:', err.message);
    return res.status(500).json({ error: 'Failed to suspend ambulance' });
  }
});

/**
 * @route PUT /api/ambulances/:id/restore
 * @desc Restore a suspended ambulance unit (city_admin only)
 */
router.put('/:id/restore', verifyToken(['city_admin']), async (req, res) => {
  try {
    const amb = await Ambulance.findByPk(req.params.id);
    if (!amb) return res.status(404).json({ error: 'Ambulance not found' });

    amb.is_active = true;
    await amb.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'RESTORE_AMBULANCE',
      resource: 'Ambulance',
      resource_id: amb.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { vehicleNo: amb.vehicleNo }
    });

    return res.json({ message: 'Ambulance restored successfully', is_active: true });
  } catch (err) {
    console.error('[AMBULANCES API] restore error:', err.message);
    return res.status(500).json({ error: 'Failed to restore ambulance' });
  }
});

/**
 * @route GET /api/ambulances/:id
 * @desc Get ambulance by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const amb = await findAmbulanceByPkOrUser(req.params.id);
    if (!amb) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }
    return res.json(amb);
  } catch (err) {
    console.error('[AMBULANCES API] Fetch single error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch ambulance' });
  }
});

module.exports = router;
