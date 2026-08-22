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

    // Seed 5 demo/mock hospitals and their admin users
    const hospitalData = [
      { id: 'd3b07384-d113-4956-a5d2-000000000001', name: 'Manipal Global Trauma Center', adminName: 'Dr. Sarah Mitchell', email: 'hosp-001@rescuelink.com', lat: 12.9592, lng: 77.6444 },
      { id: 'd3b07384-d113-4956-a5d2-000000000002', name: "St. John's Medical College", adminName: 'Dr. James Wilson', email: 'hosp-002@rescuelink.com', lat: 12.9344, lng: 77.6111 },
      { id: 'd3b07384-d113-4956-a5d2-000000000003', name: 'Apollo Hospital Bengaluru', adminName: 'Dr. Emily Chen', email: 'hosp-003@rescuelink.com', lat: 12.8958, lng: 77.5983 },
      { id: 'd3b07384-d113-4956-a5d2-000000000004', name: 'Metropolitan Multispeciality', adminName: 'Dr. David Foster', email: 'hosp-004@rescuelink.com', lat: 12.9716, lng: 77.5946 },
      { id: 'd3b07384-d113-4956-a5d2-000000000005', name: 'Cardiac & Neuro Institute', adminName: 'Dr. Maria Garcia', email: 'hosp-005@rescuelink.com', lat: 13.0116, lng: 77.5501 }
    ];

    const hospPasswordHash = bcrypt.hashSync('rescue123', 10);
    for (const h of hospitalData) {
      const hosp = await Hospital.create({
        id: h.id,
        name: h.name,
        city: 'Bengaluru',
        state: 'Karnataka',
        lat: h.lat,
        lng: h.lng,
        contact_number: '+91-9988776655',
        total_beds: 100,
        icu_beds: 20,
        ventilators: 10,
        is_active: true
      });
      console.log('[SEED] Created hospital:', hosp.name);

      const user = await User.create({
        name: h.adminName,
        email: h.email,
        password: hospPasswordHash,
        role: 'hospital_admin',
        mobile: '+91-9988776655',
        hospital_id: h.id,
        is_active: true
      });
      console.log('[SEED] Created hospital admin:', user.email);
    }

    // Seed 5 demo/mock ambulances and their paramedic users
    const ambulancePasswords = {
      'AMB-101': 'kP9x#vR2$m',
      'AMB-102': 'wF7!zN4*qB',
      'AMB-103': 'tY5&cX3@hL',
      'AMB-104': 'gJ2(sD8^pW',
      'AMB-105': 'bM4%aV7)eK'
    };

    const ambulanceData = [
      { id: 'e3b07384-d113-4956-a5d2-000000000001', vehicleNo: 'AMB-101', driverName: 'Metro Alpha (ALS)', type: 'ALS', contactInfo: '+91-8877665541' },
      { id: 'e3b07384-d113-4956-a5d2-000000000002', vehicleNo: 'AMB-102', driverName: 'Zonal Unit 04', type: 'BLS', contactInfo: '+91-8877665542' },
      { id: 'e3b07384-d113-4956-a5d2-000000000003', vehicleNo: 'AMB-103', driverName: 'Cardiac Support 12', type: 'ALS', contactInfo: '+91-8877665543' },
      { id: 'e3b07384-d113-4956-a5d2-000000000004', vehicleNo: 'AMB-104', driverName: 'Regional Hub 09', type: 'BLS', contactInfo: '+91-8877665544' },
      { id: 'e3b07384-d113-4956-a5d2-000000000005', vehicleNo: 'AMB-105', driverName: 'Express Trauma Unit', type: 'ALS', contactInfo: '+91-8877665545' }
    ];

    const { Ambulance } = require('../utils/db');
    for (const a of ambulanceData) {
      const plainPassword = ambulancePasswords[a.vehicleNo];
      const hash = bcrypt.hashSync(plainPassword, 10);
      const email = `${a.vehicleNo.toLowerCase()}@rescuelink.com`;

      await Ambulance.create({
        id: a.id,
        vehicleNo: a.vehicleNo,
        driverName: a.driverName,
        contactInfo: a.contactInfo,
        type: a.type,
        password: hash,
        is_active: true
      });
      console.log('[SEED] Created ambulance:', a.vehicleNo);

      await User.create({
        name: a.driverName,
        email,
        password: hash,
        role: 'paramedic',
        mobile: a.contactInfo,
        is_active: true
      });
      console.log('[SEED] Created paramedic user:', email);
    }

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
