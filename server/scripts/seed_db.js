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

    // 1. Seed 3 hospitals
    const hospitals = await Hospital.bulkCreate([
      {
        name: 'Manipal Global Trauma Center',
        city: 'Bengaluru',
        state: 'Karnataka',
        lat: 12.9592,
        lng: 77.6444,
        contact_number: '+91-80-2502-4444',
        total_beds: 150,
        icu_beds: 20,
        ventilators: 10,
        is_active: true
      },
      {
        name: "St. John's Medical College",
        city: 'Bengaluru',
        state: 'Karnataka',
        lat: 12.9344,
        lng: 77.6111,
        contact_number: '+91-80-2206-5000',
        total_beds: 120,
        icu_beds: 15,
        ventilators: 8,
        is_active: true
      },
      {
        name: 'Apollo Hospital Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        lat: 12.8958,
        lng: 77.5983,
        contact_number: '+91-80-2630-4050',
        total_beds: 100,
        icu_beds: 10,
        ventilators: 5,
        is_active: true
      }
    ]);
    console.log(`[SEED] Created ${hospitals.length} hospitals.`);

    const manipalHospital = hospitals[0];

    // 2. Seed Users
    const passwordHash = bcrypt.hashSync('password123', 10);
    const users = await User.bulkCreate([
      {
        name: 'Dr. Sarah Smith',
        email: 'doctor@rescuelink.com',
        password: passwordHash,
        role: 'doctor',
        mobile: '+91-9988776655',
        hospital_id: manipalHospital.id,
        is_active: true
      },
      {
        name: 'Dr. James Wilson',
        email: 'doctor2@rescuelink.com',
        password: passwordHash,
        role: 'doctor',
        mobile: '+91-9988776656',
        hospital_id: hospitals[1].id,
        is_active: true
      },
      {
        name: 'Dr. Emily Chen',
        email: 'doctor3@rescuelink.com',
        password: passwordHash,
        role: 'doctor',
        mobile: '+91-9988776657',
        hospital_id: hospitals[2].id,
        is_active: true
      },
      {
        name: 'Paramedic John Doe',
        email: 'paramedic@rescuelink.com',
        password: passwordHash,
        role: 'paramedic',
        mobile: '+91-8877665544',
        is_active: true
      },
      {
        name: 'Government Admin',
        email: 'admin@rescuelink.com',
        password: passwordHash,
        role: 'city_admin',
        mobile: '+91-7766554433',
        is_active: true
      },
      {
        name: 'Emergency Patient',
        email: 'patient@rescuelink.com',
        password: passwordHash,
        role: 'patient',
        mobile: '+91-9900887766',
        is_active: true
      }
    ]);
    console.log(`[SEED] Created ${users.length} users.`);

    const paramedicUser = users[1];
    const doctorUser = users[0];

    // 3. Seed Patients from patients.json (strictly synthetic fixture structure)
    const patientsFilePath = path.join(__dirname, '../data/patients.json');
    let seededPatients = [];
    if (fs.existsSync(patientsFilePath)) {
      const rawData = fs.readFileSync(patientsFilePath, 'utf8');
      const patientsData = JSON.parse(rawData);
      
      const patientsToCreate = Object.values(patientsData).map(p => {
        return {
          name: p.name,
          name_masked: maskName(p.name),
          dob: p.dob || '1990-01-01',
          blood_group: p.bloodGroup || 'O+',
          abha_number: p.nationalId || null,
          allergies: p.allergies || [],
          conditions: p.medicalHistory || [],
          emergency_contact_name: p.emergencyContact ? p.emergencyContact.split(' – ')[0] : 'Guardian',
          emergency_contact_mobile: p.emergencyContact ? p.emergencyContact.split(' – ')[1] : '+91-9876543210',
          hospital_id: manipalHospital.id,
          consent_obtained: true,
          consent_timestamp: new Date()
        };
      });

      seededPatients = await Patient.bulkCreate(patientsToCreate, { individualHooks: true });
      console.log(`[SEED] Seeded ${seededPatients.length} patients from patients.json.`);
    } else {
      console.warn('[SEED WARNING] patients.json not found, skipping patient seeding.');
    }

    if (seededPatients.length > 0) {
      const firstPatient = seededPatients[0];

      // 4. Seed an Active Incident (Encounter)
      const incident = await Incident.create({
        patient_id: firstPatient.id,
        ambulance_id: 'AMB-KAR-01',
        paramedic_id: paramedicUser.id,
        hospital_id: manipalHospital.id,
        status: 'en_route',
        pickup_lat: 12.9562,
        pickup_lng: 77.6394,
        pickup_address: '100 Feet Rd, Indiranagar, Bengaluru',
        news2_score: 5,
        vitals_log: [],
        gps_log: [],
        notes: 'Patient exhibiting respiratory distress, SpO2 borderline.',
        fhir_class: 'EMER',
        fhir_priority: 'urgent'
      });
      console.log(`[SEED] Created synthetic Incident: ${incident.id}`);

      // 5. Seed Vitals History (Observations)
      await VitalsHistory.bulkCreate([
        {
          incident_id: incident.id,
          timestamp: new Date(Date.now() - 600000),
          heart_rate: 92,
          spo2: 94,
          sbp: 118,
          dbp: 76,
          respiratory_rate: 20,
          temperature: 37.1,
          news2_value: 3
        },
        {
          incident_id: incident.id,
          timestamp: new Date(Date.now() - 300000),
          heart_rate: 98,
          spo2: 92,
          sbp: 115,
          dbp: 72,
          respiratory_rate: 22,
          temperature: 37.3,
          news2_value: 5
        }
      ]);
      console.log('[SEED] Seeded vitals history observations.');

      // 6. Seed Consents
      await Consent.create({
        patient_id: firstPatient.id,
        user_id: doctorUser.id,
        status: 'active',
        scope: 'patient-records-share',
        expires_at: new Date(Date.now() + 86400000)
      });
      console.log('[SEED] Seeded synthetic consents.');

      // 7. Seed Insurance Claims
      await InsuranceClaim.create({
        incident_id: incident.id,
        patient_id: firstPatient.id,
        policy_number: 'POL-AB-987654',
        claim_amount: 15500.00,
        status: 'submitted'
      });
      console.log('[SEED] Seeded synthetic insurance claim.');
    }

    // 8. Seed Blood Request
    await BloodRequest.create({
      hospital_id: manipalHospital.id,
      blood_type: 'O-',
      units: 4,
      status: 'pending',
      urgency: 'urgent'
    });
    console.log('[SEED] Seeded synthetic blood requests.');

    console.log('[SEED] Database seeding completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[SEED ERROR] Seeding failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
