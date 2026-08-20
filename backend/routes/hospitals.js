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

/**
 * @route POST /api/hospitals/register
 * @desc Public/Manual registration portal for hospitals
 */
router.post('/register', async (req, res) => {
  const { name, city, state, lat, lng, contact_number, total_beds, icu_beds, ventilators } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Hospital name is required' });
  }

  try {
    const hospital = await Hospital.create({
      name,
      city,
      state,
      lat: lat || 12.9716,
      lng: lng || 77.5946,
      contact_number,
      total_beds: total_beds || 50,
      icu_beds: icu_beds || 10,
      ventilators: ventilators || 5,
      is_active: true
    });

    await cache.del(ALL_HOSPITALS_CACHE_KEY);
    console.log(`[REGISTRY] New hospital registered manually: ${hospital.name} (${hospital.id})`);
    return res.status(201).json(hospital);
  } catch (err) {
    console.error('[HOSPITALS API] Registration failed:', err.message);
    return res.status(500).json({ error: 'Hospital registration failed' });
  }
});

/**
 * @route GET /api/hospitals/:id/doctors
 * @desc Get all doctors associated with the hospital
 */
router.get('/:id/doctors', verifyToken(['hospital_admin', 'doctor', 'city_admin']), async (req, res) => {
  try {
    const { User } = require('../utils/db');
    const doctors = await User.findAll({
      where: { hospital_id: req.params.id, role: 'doctor', is_active: true },
      attributes: ['id', 'name', 'email', 'mobile', 'specialty', 'is_on_duty', 'doctor_status']
    });
    return res.json(doctors);
  } catch (err) {
    console.error('[HOSPITALS API] Get doctors failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch doctors list' });
  }
});

/**
 * @route POST /api/hospitals/:id/doctors
 * @desc Add/register a new doctor to the hospital
 */
router.post('/:id/doctors', verifyToken(['hospital_admin']), async (req, res) => {
  const { name, email, password, specialty, mobile } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const { User, DoctorHospital } = require('../utils/db');
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ error: 'Email account already registered' });
    }

    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);

    const doctorUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: passwordHash,
      role: 'doctor',
      mobile: mobile || '',
      hospital_id: req.params.id,
      specialty: specialty || 'General Medicine',
      is_on_duty: true,
      doctor_status: 'AVAILABLE',
      is_active: true
    });

    if (DoctorHospital) {
      await DoctorHospital.create({
        doctorId: doctorUser.id,
        hospitalId: req.params.id
      });
    }

    console.log(`[STAFF] New doctor registered: ${doctorUser.email} for hospital ${req.params.id}`);
    return res.status(201).json({
      id: doctorUser.id,
      name: doctorUser.name,
      email: doctorUser.email,
      specialty: doctorUser.specialty
    });
  } catch (err) {
    console.error('[HOSPITALS API] Invite doctor failed:', err.message);
    return res.status(500).json({ error: 'Failed to add doctor to hospital registry' });
  }
});

/**
 * @route PUT /api/hospitals/:id/doctors/:doctorId
 * @desc Update a doctor's shift/duty status
 */
router.put('/:id/doctors/:doctorId', verifyToken(['hospital_admin', 'doctor']), async (req, res) => {
  const { isOnDuty, doctorStatus } = req.body;

  try {
    const { User } = require('../utils/db');
    const doctor = await User.findOne({
      where: { id: req.params.doctorId, hospital_id: req.params.id, role: 'doctor' }
    });

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found at this hospital' });
    }

    if (isOnDuty !== undefined) doctor.is_on_duty = isOnDuty;
    if (doctorStatus !== undefined) doctor.doctor_status = doctorStatus;

    await doctor.save();

    console.log(`[STAFF] Updated doctor ${doctor.name} status: duty=${doctor.is_on_duty}, status=${doctor.doctor_status}`);
    return res.json({
      id: doctor.id,
      name: doctor.name,
      is_on_duty: doctor.is_on_duty,
      doctor_status: doctor.doctor_status
    });
  } catch (err) {
    console.error('[HOSPITALS API] Update doctor status failed:', err.message);
    return res.status(500).json({ error: 'Failed to update doctor status' });
  }
});

/**
 * @route GET /api/hospitals/:id/beds
 * @desc Get bed tracking layouts for a hospital
 */
router.get('/:id/beds', verifyToken(['hospital_admin', 'doctor', 'city_admin']), async (req, res) => {
  try {
    const hospital = await Hospital.findByPk(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    let beds = [];
    if (hospital.bed_statuses) {
      try {
        beds = JSON.parse(hospital.bed_statuses);
      } catch (e) {
        beds = [];
      }
    }
    if (beds.length === 0) {
      // Default beds structure
      beds = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        status: i % 3 === 0 ? 'OCCUPIED' : i % 4 === 0 ? 'RESERVED' : 'AVAILABLE',
        label: `Bed ${(i + 1).toString().padStart(2, '0')}`
      }));
      hospital.bed_statuses = JSON.stringify(beds);
      await hospital.save();
    }
    return res.json(beds);
  } catch (err) {
    console.error('[HOSPITALS API] Get beds error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch bed layout' });
  }
});

/**
 * @route PUT /api/hospitals/:id/beds
 * @desc Update bed tracking layouts for a hospital
 */
router.put('/:id/beds', verifyToken(['hospital_admin', 'doctor']), async (req, res) => {
  const { beds } = req.body;
  if (!Array.isArray(beds)) {
    return res.status(400).json({ error: 'Beds must be an array' });
  }
  try {
    const hospital = await Hospital.findByPk(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    hospital.bed_statuses = JSON.stringify(beds);
    await hospital.save();
    return res.json({ success: true, beds });
  } catch (err) {
    console.error('[HOSPITALS API] Update beds error:', err.message);
    return res.status(500).json({ error: 'Failed to save bed layout' });
  }
});

module.exports = router;
