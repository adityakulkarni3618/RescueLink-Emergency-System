/**
 * remove_seed_entities.js
 * One-time script: deletes ONLY the auto-seeded demo hospitals, ambulances and
 * their associated user accounts from Neon PostgreSQL.
 * User-registered entities are NOT touched.
 */

const { Hospital, Ambulance, User, sequelize, syncDatabase } = require('../utils/db');

// These are the exact IDs used in seed_db.js — ONLY these will be deleted
const SEEDED_HOSPITAL_IDS = [
  'd3b07384-d113-4956-a5d2-000000000001',
  'd3b07384-d113-4956-a5d2-000000000002',
  'd3b07384-d113-4956-a5d2-000000000003',
  'd3b07384-d113-4956-a5d2-000000000004',
  'd3b07384-d113-4956-a5d2-000000000005'
];

const SEEDED_AMBULANCE_IDS = [
  'e3b07384-d113-4956-a5d2-000000000001',
  'e3b07384-d113-4956-a5d2-000000000002',
  'e3b07384-d113-4956-a5d2-000000000003',
  'e3b07384-d113-4956-a5d2-000000000004',
  'e3b07384-d113-4956-a5d2-000000000005'
];

const SEEDED_USER_EMAILS = [
  'hosp-001@rescuelink.com',
  'hosp-002@rescuelink.com',
  'hosp-003@rescuelink.com',
  'hosp-004@rescuelink.com',
  'hosp-005@rescuelink.com',
  'amb-101@rescuelink.com',
  'amb-102@rescuelink.com',
  'amb-103@rescuelink.com',
  'amb-104@rescuelink.com',
  'amb-105@rescuelink.com'
];

async function removeSeedEntities() {
  try {
    await syncDatabase();
    console.log('[CLEANUP] Connected to database.');

    // Delete seeded hospital admin users
    const deletedUsers = await User.destroy({
      where: { email: SEEDED_USER_EMAILS }
    });
    console.log(`[CLEANUP] Deleted ${deletedUsers} seeded user accounts.`);

    // Delete seeded hospitals
    const deletedHospitals = await Hospital.destroy({
      where: { id: SEEDED_HOSPITAL_IDS }
    });
    console.log(`[CLEANUP] Deleted ${deletedHospitals} seeded demo hospitals.`);

    // Delete seeded ambulances
    const deletedAmbulances = await Ambulance.destroy({
      where: { id: SEEDED_AMBULANCE_IDS }
    });
    console.log(`[CLEANUP] Deleted ${deletedAmbulances} seeded demo ambulances.`);

    // Count remaining (user-registered) entities
    const remainingHospitals = await Hospital.count();
    const remainingAmbulances = await Ambulance.count();
    console.log(`\n[CLEANUP] ✅ Done. Remaining in database:`);
    console.log(`  Hospitals  : ${remainingHospitals}`);
    console.log(`  Ambulances : ${remainingAmbulances}`);

    process.exit(0);
  } catch (err) {
    console.error('[CLEANUP ERROR]', err);
    process.exit(1);
  }
}

removeSeedEntities();
