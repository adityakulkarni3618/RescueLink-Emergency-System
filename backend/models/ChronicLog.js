const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ChronicLog = sequelize.define('ChronicLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    blood_glucose: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    systolic_bp: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    diastolic_bp: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    medication_adherence: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    },
    symptoms: {
      type: DataTypes.STRING,
      allowNull: true
    },
    asthma_inhaler_usage: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    tableName: 'chronic_logs',
    timestamps: true
  });

  return ChronicLog;
};
