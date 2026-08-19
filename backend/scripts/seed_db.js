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
const fs = require('fs');
const path = require('path');

function maskName(name) {
  if (!name) return "";
  return name.split(' ').map(part => {
    if (part.length <= 2) return part[0] + '*';
    return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
  }).join(' ');
}

async function seed() {
  try {
    console.log('[SEED] Dropping all tables for a clean rebuild...');
    // Drop all tables
    await sequelize.drop();
    console.log('[SEED] All tables dropped.');

    console.log('[SEED] Connecting and syncing database...');
    await syncDatabase();

    // Disable foreign key checks for clearing data
    if (sequelize.options.dialect === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;');
    } else {
      await sequelize.query(`
        ALTER TABLE users DISABLE TRIGGER ALL;
        ALTER TABLE patients DISABLE TRIGGER ALL;
        ALTER TABLE hospitals DISABLE TRIGGER ALL;
        ALTER TABLE incidents DISABLE TRIGGER ALL;
        ALTER TABLE vitals_history DISABLE TRIGGER ALL;
        ALTER TABLE blood_requests DISABLE TRIGGER ALL;
        ALTER TABLE insurance_claims DISABLE TRIGGER ALL;
        ALTER TABLE consents DISABLE TRIGGER ALL;
        ALTER TABLE audit_logs DISABLE TRIGGER ALL;
        ALTER TABLE pending_erasures DISABLE TRIGGER ALL;
      `);
    }

    // Clear old data to prevent constraint failures (bypass hooks for development seeding cleanup)
    await VitalsHistory.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await InsuranceClaim.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await Consent.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await PendingErasure.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await Incident.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await Patient.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await User.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await Hospital.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await BloodRequest.destroy({ truncate: { cascade: true }, where: {}, hooks: false });
    await AuditLog.destroy({ truncate: { cascade: true }, where: {}, hooks: false });

    // Re-enable foreign key checks
    if (sequelize.options.dialect === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = ON;');
    } else {
      await sequelize.query(`
        ALTER TABLE users ENABLE TRIGGER ALL;
        ALTER TABLE patients ENABLE TRIGGER ALL;
        ALTER TABLE hospitals ENABLE TRIGGER ALL;
        ALTER TABLE incidents ENABLE TRIGGER ALL;
        ALTER TABLE vitals_history ENABLE TRIGGER ALL;
        ALTER TABLE blood_requests ENABLE TRIGGER ALL;
        ALTER TABLE insurance_claims ENABLE TRIGGER ALL;
        ALTER TABLE consents ENABLE TRIGGER ALL;
        ALTER TABLE audit_logs ENABLE TRIGGER ALL;
        ALTER TABLE pending_erasures ENABLE TRIGGER ALL;
      `);
    }

    console.log('[SEED] Database cleared.');

    console.log('[SEED] Database cleared.');

    // Seed ONLY the city admin user
    const passwordHash = bcrypt.hashSync('password123', 10);
    const adminUser = await User.create({
      name: 'Government Admin',
      email: 'admin@rescuelink.com',
      password: passwordHash,
      role: 'city_admin',
      mobile: '+91-7766554433',
      is_active: true
    });
    console.log('[SEED] Created admin user:', adminUser.email);

    console.log('[SEED] Database seeding completed successfully.');
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
