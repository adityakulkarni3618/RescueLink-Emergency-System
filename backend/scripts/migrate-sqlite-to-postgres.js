// migrate-sqlite-to-postgres.js
// Script to migrate registered data from local SQLite database to Neon PostgreSQL cloud database

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sqlitePath = path.resolve(__dirname, '../data/rescuelink.sqlite');

if (!fs.existsSync(sqlitePath)) {
  console.log('[-] Local SQLite database not found at:', sqlitePath);
  console.log('[-] Nothing to migrate.');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error('[!] DATABASE_URL env variable not set. Can only migrate to a configured PostgreSQL database.');
  process.exit(1);
}

// 1. Initialize SQLite connection
const sqliteSequelize = new Sequelize({
  dialect: 'sqlite',
  storage: sqlitePath,
  logging: false
});

// 2. Initialize PostgreSQL connection
const pgSequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

// 3. Define basic schemas for migration
const defineModels = (sequelizeInstance) => {
  const User = require('../models/User')(sequelizeInstance);
  const Hospital = require('../models/Hospital')(sequelizeInstance);
  const Patient = require('../models/Patient')(sequelizeInstance);
  const Ambulance = require('../models/Ambulance')(sequelizeInstance);

  return { User, Hospital, Patient, Ambulance };
};

const srcModels = defineModels(sqliteSequelize);
const destModels = defineModels(pgSequelize);

async function migrate() {
  try {
    console.log('[+] Connecting to source SQLite database...');
    await sqliteSequelize.authenticate();
    console.log('[+] Connecting to destination Neon PostgreSQL database...');
    await pgSequelize.authenticate();

    // 1. Migrate Hospitals
    console.log('\n[1/4] Migrating Hospitals...');
    const srcHospitals = await srcModels.Hospital.findAll();
    console.log(`Found ${srcHospitals.length} hospitals in SQLite.`);
    let hospCount = 0;
    for (const h of srcHospitals) {
      const exists = await destModels.Hospital.findByPk(h.id);
      if (!exists) {
        await destModels.Hospital.create(h.toJSON());
        hospCount++;
      }
    }
    console.log(`Successfully migrated ${hospCount} new hospitals.`);

    // 2. Migrate Patients
    console.log('\n[2/4] Migrating Patients...');
    const srcPatients = await srcModels.Patient.findAll();
    console.log(`Found ${srcPatients.length} patients in SQLite.`);
    let patCount = 0;
    for (const p of srcPatients) {
      const exists = await destModels.Patient.findByPk(p.id);
      if (!exists) {
        await destModels.Patient.create(p.toJSON());
        patCount++;
      }
    }
    console.log(`Successfully migrated ${patCount} new patients.`);

    // 3. Migrate Users
    console.log('\n[3/4] Migrating Users...');
    const srcUsers = await srcModels.User.findAll();
    console.log(`Found ${srcUsers.length} users in SQLite.`);
    let userCount = 0;
    for (const u of srcUsers) {
      const exists = await destModels.User.findByPk(u.id);
      if (!exists) {
        await destModels.User.create(u.toJSON());
        userCount++;
      }
    }
    console.log(`Successfully migrated ${userCount} new users.`);

    // 4. Migrate Ambulances
    console.log('\n[4/4] Migrating Ambulances...');
    const srcAmbulances = await srcModels.Ambulance.findAll();
    console.log(`Found ${srcAmbulances.length} ambulances in SQLite.`);
    let ambCount = 0;
    for (const a of srcAmbulances) {
      const exists = await destModels.Ambulance.findByPk(a.id);
      if (!exists) {
        await destModels.Ambulance.create(a.toJSON());
        ambCount++;
      }
    }
    console.log(`Successfully migrated ${ambCount} new ambulances.`);

    console.log('\n[+] Migration successfully completed!');
  } catch (err) {
    console.error('[!] Migration failed:', err);
  } finally {
    await sqliteSequelize.close();
    await pgSequelize.close();
  }
}

migrate();
