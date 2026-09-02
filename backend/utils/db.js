const { Sequelize } = require('sequelize');
const { execSync } = require('child_process');

let useSqlite = process.env.FORCE_SQLITE === 'true';
if (process.env.RENDER === 'true' || process.env.NODE_ENV === 'production') {
  console.log('[DB] Running on Render or Production. Forcing PostgreSQL dialect.');
  useSqlite = false;
}
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;

// ── Persistent Neon Cloud PostgreSQL ──────────────────────────────────────────
// This is the AUTHORITATIVE production database. All registered entities
// (hospitals, ambulances, users) live here and survive server restarts.
// The DATABASE_URL env variable on Render/Vercel, if set, will be used instead.
// If not set, we fall back to the hardcoded Neon URL so data is NEVER lost.
const NEON_URL = "postgresql://neondb_owner:npg_YlSeb1kgv6PB@ep-shiny-dust-axomvx38-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const databaseUrl = process.env.DATABASE_URL || NEON_URL; // Allow environment variable override

if (!useSqlite && !databaseUrl) {
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
      storage: require('path').resolve(__dirname, '../data/rescuelink.sqlite'),
      logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[DB LOG] ${msg}`) : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    })
  : (databaseUrl
      ? new Sequelize(databaseUrl, {
          dialect: 'postgres',
          dialectOptions: {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          },
          logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[DB LOG] ${msg}`) : false,
          pool: {
            max: 20,
            min: 2,
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
        )
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
const Prescription = require('../models/Prescription')(sequelize);
const EmergencyCorridor = require('../models/EmergencyCorridor')(sequelize);
const GoodSamaritan = require('../models/GoodSamaritan')(sequelize);

// Define relations / associations
Patient.hasMany(Prescription, { foreignKey: 'patient_id', as: 'prescriptions' });
Prescription.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

Incident.hasMany(Prescription, { foreignKey: 'incident_id', as: 'prescriptions' });
Prescription.belongsTo(Incident, { foreignKey: 'incident_id', as: 'incident' });

Hospital.hasMany(Prescription, { foreignKey: 'hospital_id', as: 'prescriptions' });
Prescription.belongsTo(Hospital, { foreignKey: 'hospital_id', as: 'hospital' });

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

// EmergencyCorridor relations
Incident.hasMany(EmergencyCorridor, { foreignKey: 'incident_id', as: 'corridors', onDelete: 'CASCADE' });
EmergencyCorridor.belongsTo(Incident, { foreignKey: 'incident_id', as: 'incident' });

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

    // In production, migrations must be run explicitly via 'npm run migrate' to prevent race conditions or locks
    if (process.env.NODE_ENV === 'production') {
      console.log('[DB] Production environment detected. Skipping automatic migration and table sync.');
      return;
    }

    // First, sync model structures to ensure all tables exist
    await sequelize.sync();

    // Run SQL DDL Migrations
    const runMigrations = require('../scripts/run-migrations');
    await runMigrations();
    console.log('[DB] Database synchronized.');
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
  Prescription,
  EmergencyCorridor,
  GoodSamaritan,
  syncDatabase,
  healthCheck,
  closeDatabase
};
