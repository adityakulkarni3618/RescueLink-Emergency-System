/**
 * remove_seed_entities.js
 * One-time script: deletes ALL auto-seeded / demo hospitals, ambulances and
 * their associated user accounts.
 * User-registered entities are NOT touched.
 */

const { Hospital, Ambulance, User, syncDatabase } = require('../utils/db');
const { Op } = require('sequelize');

const SEEDED_HOSPITAL_NAMES = [
  'City General Trauma Center',
  'Apollo Multispecialty ER',
  'Manipal Apex Hospital',
  'Apex Trauma & Emergency Center',
  'City Central Multispecialty Hospital',
  'National Emergency Medical Center',
  'Apollo Trauma & Emergency Center',
  'City General Hospital',
  'Max Super Speciality Hospital',
  'Fortis Acute Care Unit'
];

const SEEDED_HOSPITAL_UUIDS = [
  'd3b07384-d113-4956-a5d2-000000000001',
  'd3b07384-d113-4956-a5d2-000000000002',
  'd3b07384-d113-4956-a5d2-000000000003',
  'd3b07384-d113-4956-a5d2-000000000004',
  'd3b07384-d113-4956-a5d2-000000000005'
];

const SEEDED_AMBULANCE_VEHICLES = [
  'AMB-101',
  'AMB-102',
  'AMB-103',
  'AMB-104',
  'AMB-105',
  'MH12AB1234',
  'MH12AB5678',
  'MH12AB9012'
];

const SEEDED_AMBULANCE_UUIDS = [
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
  'amb-105@rescuelink.com',
  'mh12ab1234@rescuelink.com',
  'mh12ab5678@rescuelink.com',
  'mh12ab9012@rescuelink.com'
];

async function removeSeedEntities() {
  try {
    await syncDatabase();
    console.log('[CLEANUP] Connected to database.');

    // Delete seeded hospital admin / paramedic users
    const deletedUsers = await User.destroy({
      where: {
        [Op.or]: [
          { email: { [Op.in]: SEEDED_USER_EMAILS } },
          { name: { [Op.in]: SEEDED_HOSPITAL_NAMES } }
        ]
      }
    });
    console.log(`[CLEANUP] Deleted ${deletedUsers} seeded user accounts.`);

    // Delete seeded hospitals by UUID or name
    const deletedHospitals = await Hospital.destroy({
      where: {
        [Op.or]: [
          { id: { [Op.in]: SEEDED_HOSPITAL_UUIDS } },
          { name: { [Op.in]: SEEDED_HOSPITAL_NAMES } }
        ]
      }
    });
    console.log(`[CLEANUP] Deleted ${deletedHospitals} seeded demo hospitals.`);

    // Delete seeded ambulances by UUID or vehicleNo
    const deletedAmbulances = await Ambulance.destroy({
      where: {
        [Op.or]: [
          { id: { [Op.in]: SEEDED_AMBULANCE_UUIDS } },
          { vehicleNo: { [Op.in]: SEEDED_AMBULANCE_VEHICLES } }
        ]
      }
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
