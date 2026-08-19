const { Sequelize } = require('sequelize');
const { execSync } = require('child_process');

let useSqlite = process.env.FORCE_SQLITE === 'true';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;

if (!useSqlite) {
  try {
    // Run a quick synchronous TCP socket check to verify database connectivity
    const checkCmd = `node -e "
      const net = require('net');
      const socket = net.connect(${dbPort}, '${dbHost}', () => process.exit(0));
      socket.on('error', () => process.exit(1));
      socket.setTimeout(2000, () => { socket.destroy(); process.exit(1); });
    "`;
    execSync(checkCmd, { stdio: 'ignore' });
  } catch (e) {
    console.log(`[DB] PostgreSQL not detected or unreachable on ${dbHost}:${dbPort}. Falling back to SQLite database.`);
    useSqlite = true;
  }
}

const sequelize = useSqlite
  ? new Sequelize({
      dialect: 'sqlite',
      storage: './data/rescuelink.sqlite',
      logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[DB LOG] ${msg}`) : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    })
  : new Sequelize(
      process.env.DB_NAME || 'rescuelink',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASSWORD || 'your_password',
      {
        host: dbHost,
        port: dbPort,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[DB LOG] ${msg}`) : false,
        pool: {
          max: 20, // Real-time production pool size
          min: 2,
          acquire: 30000,
          idle: 10000
        }
      }
    );

// Import models
const User = require('../models/User')(sequelize);
const Hospital = require('../models/Hospital')(sequelize);
const Patient = require('../models/Patient')(sequelize);
const Incident = require('../models/Incident')(sequelize);
const AuditLog = require('../models/AuditLog')(sequelize);
const PendingErasure = require('../models/PendingErasure')(sequelize);

// New clinical modules models
const VitalsHistory = require('../models/VitalsHistory')(sequelize);
const BloodRequest = require('../models/BloodRequest')(sequelize);
const InsuranceClaim = require('../models/InsuranceClaim')(sequelize);
const Consent = require('../models/Consent')(sequelize);
const Ambulance = require('../models/Ambulance')(sequelize);
const DoctorHospital = require('../models/DoctorHospital')(sequelize);
const ChronicLog = require('../models/ChronicLog')(sequelize);

// Define relations / associations
Hospital.hasMany(User, { foreignKey: 'hospital_id', as: 'users' });
User.belongsTo(Hospital, { foreignKey: 'hospital_id', as: 'hospital' });

Hospital.hasMany(Patient, { foreignKey: 'hospital_id', as: 'patients' });
Patient.belongsTo(Hospital, { foreignKey: 'hospital_id', as: 'hospital' });

Patient.hasMany(Incident, { foreignKey: 'patient_id', as: 'incidents' });
Incident.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

User.hasMany(Incident, { foreignKey: 'paramedic_id', as: 'paramedicIncidents' });
Incident.belongsTo(User, { foreignKey: 'paramedic_id', as: 'paramedic' });

Hospital.hasMany(Incident, { foreignKey: 'hospital_id', as: 'hospitalIncidents' });
Incident.belongsTo(Hospital, { foreignKey: 'hospital_id', as: 'hospital' });

User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(PendingErasure, { foreignKey: 'request_by_user_id', as: 'erasureRequests' });
PendingErasure.belongsTo(User, { foreignKey: 'request_by_user_id', as: 'requester' });
Patient.hasMany(PendingErasure, { foreignKey: 'patient_id', as: 'erasureLogs' });
PendingErasure.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

// Vitals history (Observation) relations
Incident.hasMany(VitalsHistory, { foreignKey: 'incident_id', as: 'vitalsHistory' });
VitalsHistory.belongsTo(Incident, { foreignKey: 'incident_id', as: 'incident' });

// Blood request relations
Hospital.hasMany(BloodRequest, { foreignKey: 'hospital_id', as: 'bloodRequests' });
BloodRequest.belongsTo(Hospital, { foreignKey: 'hospital_id', as: 'hospital' });

// Insurance Claim relations
Incident.hasMany(InsuranceClaim, { foreignKey: 'incident_id', as: 'insuranceClaims' });
InsuranceClaim.belongsTo(Incident, { foreignKey: 'incident_id', as: 'incident' });
Patient.hasMany(InsuranceClaim, { foreignKey: 'patient_id', as: 'insuranceClaims' });
InsuranceClaim.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

// Consent relations
Patient.hasMany(Consent, { foreignKey: 'patient_id', as: 'consents' });
Consent.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });
User.hasMany(Consent, { foreignKey: 'user_id', as: 'consents' });
Consent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Fleet & Multi-Hospital associations
User.hasMany(Ambulance, { foreignKey: 'ownerId', as: 'ambulances' });
Ambulance.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
User.belongsToMany(Hospital, { through: DoctorHospital, foreignKey: 'doctorId', as: 'doctorHospitals' });
Hospital.belongsToMany(User, { through: DoctorHospital, foreignKey: 'hospitalId', as: 'hospitalDoctors' });

// ChronicLog relations
Patient.hasMany(ChronicLog, { foreignKey: 'patient_id', as: 'chronicLogs' });
ChronicLog.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

/**
 * Performs db health-check.
 */
async function healthCheck() {
  try {
    await sequelize.authenticate();
    return { status: 'healthy', dialect: sequelize.getDialect() };
  } catch (err) {
    const { triggerCriticalAlert } = require('./alerting');
    await triggerCriticalAlert('DATABASE_HEALTHCHECK_UNHEALTHY', {
      error: err.message
    });
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Closes the database pool connections gracefully.
 */
async function closeDatabase() {
  try {
    console.log('[DB] Closing database connection pool...');
    await sequelize.close();
    console.log('[DB] Database connection pool closed.');
  } catch (err) {
    console.error('[DB ERROR] Error during closing connection pool:', err);
  }
}

let isSeeding = false;

/**
 * Synchronizes the database, running ALTER migrations rather than dropping tables.
 */
async function syncDatabase() {
  try {
    await sequelize.authenticate();
    if (useSqlite) {
      console.log('[DB] Connected to SQLite database');
    } else {
      console.log('[DB] Connected to PostgreSQL');
    }

    // Run SQL DDL Migrations
    const runMigrations = require('../scripts/run-migrations');
    await runMigrations();

    // Secondary sync to align any Sequelize hooks or updates
    await sequelize.sync();
    console.log('[DB] Database synchronized.');



    // Auto-seeding disabled to support completely blank system registration from scratch.
    /*
    if (useSqlite && !isSeeding) {
      try {
        const userCount = await User.count();
        if (userCount === 0) {
          console.log('[DB] SQLite database is empty. Auto-seeding default credentials...');
          isSeeding = true;
          const seed = require('../scripts/seed_db');
          await seed();
          isSeeding = false;
        }
      } catch (seedErr) {
        isSeeding = false;
        console.error('[DB WARNING] Auto-seeding failed:', seedErr.message);
      }
    }
    */
  } catch (err) {
    const { triggerCriticalAlert } = require('./alerting');
    await triggerCriticalAlert('DATABASE_CONNECT_FAIL', {
      error: err.message,
      host: dbHost,
      port: dbPort
    });
    console.error('[DB] Connection or Sync failed:', err);
  }
}

module.exports = {
  sequelize,
  User,
  Hospital,
  Patient,
  Incident,
  AuditLog,
  PendingErasure,
  VitalsHistory,
  BloodRequest,
  InsuranceClaim,
  Consent,
  Ambulance,
  DoctorHospital,
  ChronicLog,
  syncDatabase,
  healthCheck,
  closeDatabase
};
