const { User, Hospital } = require('../utils/db');

async function clearData() {
  try {
    console.log('[CLEAR] Deleting all registered doctor, hospital_admin, and paramedic users...');
    const deletedUsersCount = await User.destroy({
      where: {
        role: ['doctor', 'hospital_admin', 'paramedic']
      }
    });
    console.log(`[CLEAR] Successfully deleted ${deletedUsersCount} users.`);

    console.log('[CLEAR] Deleting all registered hospitals...');
    const deletedHospitalsCount = await Hospital.destroy({ where: {} });
    console.log(`[CLEAR] Successfully deleted ${deletedHospitalsCount} hospitals.`);

    console.log('[CLEAR] Database cleared successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[CLEAR ERROR] Failed to clear data:', err.message);
    process.exit(1);
  }
}

clearData();
