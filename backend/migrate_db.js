require('dotenv').config({ path: './.env' });
const { Sequelize } = require('sequelize');
const path = require('path');

const sqliteSeq = new Sequelize({
  dialect: 'sqlite',
  storage: path.resolve(__dirname, '../data/rescuelink.sqlite'),
  logging: false
});

const postgresSeq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

async function runMigration() {
  try {
    await sqliteSeq.authenticate();
    await postgresSeq.authenticate();
    console.log('✅ Connected to both databases.\n');

    // 1. Migrate custom Users
    const [sqliteUsers] = await sqliteSeq.query('SELECT * FROM users');
    const [pgUsers] = await postgresSeq.query('SELECT email FROM users');
    const pgEmails = new Set(pgUsers.map(u => u.email.toLowerCase()));

    for (const u of sqliteUsers) {
      if (!pgEmails.has(u.email.toLowerCase())) {
        console.log(`👤 Migrating user: ${u.email} (${u.role})`);
        await postgresSeq.query(
          `INSERT INTO users (
            id, name, email, password, role, mobile, hospital_id, abha_number, abha_address, 
            blood_group, allergies, chronic_conditions, dob, gender, fcm_token, is_active, 
            totp_secret, backup_codes, refresh_token, authority, specialty, is_on_duty, 
            doctor_status, emergency_contact_name, emergency_contact_relationship, 
            emergency_contact_phone, insurance_provider, policy_number, group_number, 
            consent_to_share_data, "createdAt", "updatedAt"
          ) VALUES (
            :id, :name, :email, :password, :role, :mobile, :hospital_id, :abha_number, :abha_address, 
            :blood_group, :allergies, :chronic_conditions, :dob, :gender, :fcm_token, :is_active, 
            :totp_secret, :backup_codes, :refresh_token, :authority, :specialty, :is_on_duty, 
            :doctor_status, :emergency_contact_name, :emergency_contact_relationship, 
            :emergency_contact_phone, :insurance_provider, :policy_number, :group_number, 
            :consent_to_share_data, :createdAt, :updatedAt
          )`,
          {
            replacements: {
              ...u,
              is_active: u.is_active === 1 || u.is_active === true || u.is_active === 'true',
              is_on_duty: u.is_on_duty === 1 || u.is_on_duty === true || u.is_on_duty === 'true',
              consent_to_share_data: u.consent_to_share_data === 1 || u.consent_to_share_data === true || u.consent_to_share_data === 'true',
              createdAt: u.createdAt || new Date(),
              updatedAt: u.updatedAt || new Date()
            }
          }
        );
      }
    }

    // 2. Migrate custom Hospitals
    const [sqliteHospitals] = await sqliteSeq.query('SELECT * FROM hospitals');
    const [pgHospitals] = await postgresSeq.query('SELECT id FROM hospitals');
    const pgHospIds = new Set(pgHospitals.map(h => h.id));

    for (const h of sqliteHospitals) {
      if (!pgHospIds.has(h.id)) {
        console.log(`🏥 Migrating hospital: ${h.name} (${h.id})`);
        await postgresSeq.query(
          `INSERT INTO hospitals (
            id, name, city, state, lat, lng, contact_number, total_beds, icu_beds, 
            ventilators, is_active, license_number, departments, bay_capacity, 
            bed_statuses, trauma_tier, accreditation_id, "createdAt", "updatedAt"
          ) VALUES (
            :id, :name, :city, :state, :lat, :lng, :contact_number, :total_beds, :icu_beds, 
            :ventilators, :is_active, :license_number, :departments, :bay_capacity, 
            :bed_statuses, :trauma_tier, :accreditation_id, :createdAt, :updatedAt
          )`,
          {
            replacements: {
              ...h,
              is_active: h.is_active === 1 || h.is_active === true || h.is_active === 'true',
              createdAt: h.createdAt || new Date(),
              updatedAt: h.updatedAt || new Date()
            }
          }
        );
      }
    }

    // 3. Migrate custom Ambulances
    const [sqliteAmbulances] = await sqliteSeq.query('SELECT * FROM ambulances');
    const [pgAmbulances] = await postgresSeq.query('SELECT id FROM ambulances');
    const pgAmbIds = new Set(pgAmbulances.map(a => a.id));

    for (const a of sqliteAmbulances) {
      if (!pgAmbIds.has(a.id)) {
        console.log(`🚑 Migrating ambulance: ${a.vehicleNo} (${a.driverName})`);
        await postgresSeq.query(
          `INSERT INTO ambulances (
            id, "vehicleNo", type, "driverName", "contactInfo", password, "ownerId", 
            totp_secret, is_active, hospital_id, equipment_checklist, crew_members, 
            license_number, license_expiry, is_system_standard, oxygen_capacity_liters, 
            engine_temp, fuel_level, battery_voltage, diagnostic_fault_codes, "createdAt", "updatedAt"
          ) VALUES (
            :id, :vehicleNo, :type, :driverName, :contactInfo, :password, :ownerId, 
            :totp_secret, :is_active, :hospital_id, :equipment_checklist, :crew_members, 
            :license_number, :license_expiry, :is_system_standard, :oxygen_capacity_liters, 
            :engine_temp, :fuel_level, :battery_voltage, :diagnostic_fault_codes, :createdAt, :updatedAt
          )`,
          {
            replacements: {
              ...a,
              is_active: a.is_active === 1 || a.is_active === true || a.is_active === 'true',
              is_system_standard: a.is_system_standard === 1 || a.is_system_standard === true || a.is_system_standard === 'true',
              createdAt: a.createdAt || new Date(),
              updatedAt: a.updatedAt || new Date()
            }
          }
        );
      }
    }

    console.log('\n🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await sqliteSeq.close();
    await postgresSeq.close();
  }
}

runMigration();
