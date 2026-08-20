require('dotenv').config();
const { Hospital, User } = require('../utils/db');

async function deleteHospital(name) {
  if (!name) {
    console.error('Please specify a hospital name. Example: node scripts/delete_hospital.js "Shaikh Memorial Hospital"');
    process.exit(1);
  }

  try {
    console.log(`[DELETE] Finding hospital with name: "${name}"...`);
    const hospital = await Hospital.findOne({ where: { name } });

    if (!hospital) {
      console.log(`[DELETE] No hospital found with name: "${name}".`);
      process.exit(0);
    }

    console.log(`[DELETE] Found hospital: "${hospital.name}" (ID: ${hospital.id})`);

    // Delete associated hospital users
    console.log('[DELETE] Deleting associated users...');
    const deletedUsers = await User.destroy({
      where: { hospital_id: hospital.id }
    });
    console.log(`[DELETE] Deleted ${deletedUsers} users.`);

    // Delete hospital
    console.log('[DELETE] Deleting hospital record...');
    await hospital.destroy();
    console.log(`[DELETE] Hospital "${name}" deleted successfully.`);

    process.exit(0);
  } catch (err) {
    console.error('[DELETE ERROR] Failed to delete hospital:', err);
    process.exit(1);
  }
}

const targetName = process.argv.slice(2).join(' ');
deleteHospital(targetName || 'Shaikh Memorial Hospital');
