const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Prescription = sequelize.define('Prescription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incident_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    medications: {
      type: DataTypes.TEXT,
      defaultValue: '[]',
      comment: 'JSON string array of drugs, dosages, and instructions'
    },
    diagnosis: {
      type: DataTypes.STRING,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    follow_up_date: {
      type: DataTypes.STRING,
      allowNull: true
    },
    discharge_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'prescriptions',
    timestamps: true
  });

  return Prescription;
};
