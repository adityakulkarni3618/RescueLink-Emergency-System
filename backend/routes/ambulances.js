const express = require('express');
const router = express.Router();
const { Ambulance, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

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
      is_active: true
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
  const { driverName, type, contactInfo, is_active } = req.body;
  try {
    const amb = await Ambulance.findByPk(req.params.id);
    if (!amb) {
      return res.status(404).json({ error: 'Ambulance not found' });
    }

    if (driverName) amb.driverName = driverName;
    if (type) amb.type = type;
    if (contactInfo) amb.contactInfo = contactInfo;
    if (is_active !== undefined) amb.is_active = is_active;

    await amb.save();
    console.log(`[REGISTRY] Ambulance details updated: ${amb.vehicleNo}`);
    return res.json(amb);
  } catch (err) {
    console.error('[AMBULANCES API] Settings update error:', err.message);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
