const { DataTypes } = require('sequelize');
const { encrypt, decrypt } = require('../utils/encryption');

const ENCRYPTED_FIELDS = ['name', 'dob', 'abha_number', 'emergency_contact_name', 'emergency_contact_mobile'];

function encryptFields(patient) {
  ENCRYPTED_FIELDS.forEach(field => {
    const val = patient.getDataValue(field);
    if (val && patient.changed(field)) {
      patient.setDataValue(field, encrypt(val));
    }
  });
}

function decryptFields(patient) {
  if (!patient) return;
  ENCRYPTED_FIELDS.forEach(field => {
    const val = patient.getDataValue(field);
    if (val) {
      patient.setDataValue(field, decrypt(val));
    }
  });
}

module.exports = (sequelize) => {
  const Patient = sequelize.define('Patient', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name_masked: {
      type: DataTypes.STRING
    },
    dob: {
      type: DataTypes.DATEONLY
    },
    blood_group: {
      type: DataTypes.STRING
    },
    abha_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    allergies: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    conditions: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    emergency_contact_name: {
      type: DataTypes.STRING
    },
    emergency_contact_mobile: {
      type: DataTypes.STRING
    },
    gender: {
      type: DataTypes.STRING,
      defaultValue: 'unknown'
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    consent_obtained: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    consent_timestamp: {
      type: DataTypes.DATE,
      allowNull: true
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'patients',
    timestamps: true,
    hooks: {
      beforeCreate: (patient) => {
        encryptFields(patient);
      },
      beforeUpdate: (patient) => {
        encryptFields(patient);
      },
      afterFind: (result) => {
        if (!result) return;
        if (Array.isArray(result)) {
          result.forEach(patient => decryptFields(patient));
        } else {
          decryptFields(result);
        }
      },
      afterCreate: (patient) => {
        decryptFields(patient);
      },
      afterUpdate: (patient) => {
        decryptFields(patient);
      }
    }
  });

  return Patient;
};
