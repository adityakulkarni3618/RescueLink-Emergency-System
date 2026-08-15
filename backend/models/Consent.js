const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Consent = sequelize.define('Consent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false, // e.g. active, proposed, inactive
      defaultValue: 'active'
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: false // e.g. patient-records-share, emergency-only
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    policy_version: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'v1.0'
    },
    consent_details: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'consents',
    timestamps: true
  });

  return Consent;
};
