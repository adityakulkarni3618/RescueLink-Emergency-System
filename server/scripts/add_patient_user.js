const { User } = require('../utils/db');
const bcrypt = require('bcryptjs');

async function addPatient() {
  try {
    const passwordHash = bcrypt.hashSync('password123', 10);
    const [user, created] = await User.findOrCreate({
      where: { email: 'patient@rescuelink.com' },
      defaults: {
        name: 'Emergency Patient',
        email: 'patient@rescuelink.com',
        password: passwordHash,
        role: 'patient',
        mobile: '+91-9900887766',
        is_active: true
      }
    });

    if (created) {
      console.log('✅ Created patient@rescuelink.com user successfully!');
    } else {
      console.log('ℹ️ patient@rescuelink.com user already exists.');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to add patient user:', err);
    process.exit(1);
  }
}

addPatient();
