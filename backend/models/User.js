const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('patient', 'paramedic', 'doctor', 'hospital_admin', 'city_admin', 'family'),
      allowNull: false
    },
    mobile: {
      type: DataTypes.STRING
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    abha_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    abha_address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    blood_group: {
      type: DataTypes.STRING,
      allowNull: true
    },
    allergies: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    chronic_conditions: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true
    },
    fcm_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    totp_secret: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    backup_codes: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    refresh_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    authority: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Designation/authority title for War Room commanders (e.g. District Collector, Chief Medical Officer)'
    },
    specialty: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is_on_duty: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    doctor_status: {
      type: DataTypes.STRING,
      defaultValue: 'AVAILABLE'
    },
    emergency_contact_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    emergency_contact_relationship: {
      type: DataTypes.STRING,
      allowNull: true
    },
    emergency_contact_phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    insurance_provider: {
      type: DataTypes.STRING,
      allowNull: true
    },
    policy_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    group_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    consent_to_share_data: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'users',
    timestamps: true
  });

  return User;
};
