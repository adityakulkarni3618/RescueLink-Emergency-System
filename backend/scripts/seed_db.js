const { 
  Hospital, 
  User, 
  Patient, 
  Incident, 
  VitalsHistory, 
  BloodRequest, 
  InsuranceClaim, 
  Consent, 
  AuditLog, 
  PendingErasure, 
  sequelize,
  syncDatabase
} = require('../utils/db');
const bcrypt = require('bcryptjs');

/**
 * Safe seed: only creates the city admin account if it doesn't exist.
 * Does NOT create any demo hospitals or ambulances — those must be
 * registered manually through the War Room admin panel.
 */
async function seed(skipSync = false) {
  try {
    console.log('[SEED] Running safe database seed (admin account only)...');

    // Create the super admin user only if not already present
    const superAdminEmail = 'admin@rescuelink.com';
    const existingAdmin = await User.findOne({ where: { email: superAdminEmail } });
    if (!existingAdmin) {
      const passwordHash = bcrypt.hashSync('password123', 10);
      await User.create({
        name: 'Government Admin',
        email: superAdminEmail,
        password: passwordHash,
        role: 'city_admin',
        mobile: '+91-7766554433',
        is_active: true
      });
      console.log('[SEED] Created admin user:', superAdminEmail);
    } else {
      console.log('[SEED] Admin user already exists. Skipping.');
    }

    console.log('[SEED] Seed completed. No demo hospitals or ambulances were created.');
    if (require.main === module) {
      process.exit(0);
    }
  } catch (err) {
    console.error('[SEED ERROR] Seeding failed:', err);
    if (require.main === module) {
      process.exit(1);
    } else {
      throw err;
    }
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
