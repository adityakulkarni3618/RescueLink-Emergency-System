const express = require('express');
const router = express.Router();
const { Hospital, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const cache = require('../utils/cache');

const ALL_HOSPITALS_CACHE_KEY = 'hospitals:all';

/**
 * @route GET /api/hospitals
 * @desc Get all hospitals (Registered tenant list)
 */
router.get('/', async (req, res) => {
  try {
    const cached = await cache.get(ALL_HOSPITALS_CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    const hospitals = await Hospital.findAll({
      where: { is_active: true }
    });

    const plainHospitals = hospitals.map(h => typeof h.toJSON === 'function' ? h.toJSON() : h);
    await cache.set(ALL_HOSPITALS_CACHE_KEY, plainHospitals, 30); // Cache for 30 seconds
    return res.json(plainHospitals);
  } catch (err) {
    console.error('[HOSPITALS API] Fetch hospitals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});

/**
 * @route GET /api/hospitals/:id
 * @desc Get details of a single hospital
 */
router.get('/:id', async (req, res) => {
  const cacheKey = `hospitals:${req.params.id}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const hospital = await Hospital.findByPk(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    await cache.set(cacheKey, hospital, 60); // Cache for 60 seconds
    return res.json(hospital);
  } catch (err) {
    console.error('[HOSPITALS API] Fetch hospital by ID error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch hospital details' });
  }
});

/**
 * @route POST /api/hospitals
 * @desc Onboard a new Hospital (Tenant creation) - Admin only
 */
router.post('/', verifyToken(['city_admin']), async (req, res) => {
  const { name, city, state, lat, lng, contact_number, total_beds, icu_beds, ventilators } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Hospital name is required' });
  }

  try {
    const hospital = await Hospital.create({
      name,
      city,
      state,
      lat: lat || 0.0,
      lng: lng || 0.0,
      contact_number,
      total_beds: total_beds || 0,
      icu_beds: icu_beds || 0,
      ventilators: ventilators || 0,
      is_active: true
    });

    // Invalidate caches
    await cache.del(ALL_HOSPITALS_CACHE_KEY);

    // Write to AuditLog
    await AuditLog.create({
      user_id: req.user.id,
      action: 'ONBOARD_HOSPITAL',
      resource: 'Hospital',
      resource_id: hospital.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { name: hospital.name, city: hospital.city }
    });

    console.log(`[TENANT] Onboarded new hospital tenant: ${hospital.name} (${hospital.id})`);
    return res.status(201).json(hospital);
  } catch (err) {
    console.error('[HOSPITALS API] Error creating hospital tenant:', err.message);
    return res.status(500).json({ error: 'Failed to onboard hospital tenant' });
  }
});

/**
 * @route PUT /api/hospitals/:id
 * @desc Update hospital tenant details (staff or admin)
 */
router.put('/:id', verifyToken(['hospital_admin', 'city_admin']), async (req, res) => {
  try {
    const hospital = await Hospital.findByPk(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    // Verify tenant authorization (hospital admins can only update their own hospital)
    if (req.user.role === 'hospital_admin' && req.user.hospital_id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied: Cannot manage other hospitals' });
    }

    const { name, city, state, lat, lng, contact_number, total_beds, icu_beds, ventilators, is_active } = req.body;

    if (name) hospital.name = name;
    if (city) hospital.city = city;
    if (state) hospital.state = state;
    if (lat !== undefined) hospital.lat = lat;
    if (lng !== undefined) hospital.lng = lng;
    if (contact_number) hospital.contact_number = contact_number;
    if (total_beds !== undefined) hospital.total_beds = total_beds;
    if (icu_beds !== undefined) hospital.icu_beds = icu_beds;
    if (ventilators !== undefined) hospital.ventilators = ventilators;
    if (is_active !== undefined && req.user.role === 'city_admin') hospital.is_active = is_active;

    await hospital.save();

    // Invalidate caches
    await cache.del(ALL_HOSPITALS_CACHE_KEY);
    await cache.del(`hospitals:${req.params.id}`);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_HOSPITAL',
      resource: 'Hospital',
      resource_id: hospital.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { updatedFields: Object.keys(req.body) }
    });

    console.log(`[TENANT] Updated hospital tenant: ${hospital.name} (${hospital.id})`);
    return res.json(hospital);
  } catch (err) {
    console.error('[HOSPITALS API] Error updating hospital:', err.message);
    return res.status(500).json({ error: 'Failed to update hospital details' });
  }
});

/**
 * @route DELETE /api/hospitals/:id
 * @desc Deactivate hospital tenant (City Admin only)
 */
router.delete('/:id', verifyToken(['city_admin']), async (req, res) => {
  try {
    const hospital = await Hospital.findByPk(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    hospital.is_active = false;
    await hospital.save();

    // Invalidate caches
    await cache.del(ALL_HOSPITALS_CACHE_KEY);
    await cache.del(`hospitals:${req.params.id}`);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_HOSPITAL',
      resource: 'Hospital',
      resource_id: hospital.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { name: hospital.name }
    });

    console.log(`[TENANT] Deactivated hospital tenant: ${hospital.name} (${hospital.id})`);
    return res.json({ message: 'Hospital tenant deactivated successfully' });
  } catch (err) {
    console.error('[HOSPITALS API] Error deactivating hospital:', err.message);
    return res.status(500).json({ error: 'Failed to deactivate hospital tenant' });
  }
});

module.exports = router;
