const express = require('express');
const router = express.Router();
const { User, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');

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

module.exports = router;
