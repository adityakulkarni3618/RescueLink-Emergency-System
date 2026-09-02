const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InsuranceClaim = sequelize.define('InsuranceClaim', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    claim_reference_no: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    incident_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    patient_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    patient_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    abdm_abha_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    policy_number: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'PMJAY-AYUSHMAN-GOVT'
    },
    icd10_code: {
      type: DataTypes.STRING,
      defaultValue: 'I21.9' // Default Acute Myocardial Infarction
    },
    emergency_condition: {
      type: DataTypes.STRING,
      allowNull: false
    },
    estimated_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    approved_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    hospital_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('APPROVED', 'PENDING_DOCUMENTATION', 'REJECTED'),
      defaultValue: 'APPROVED'
    }
  }, {
    tableName: 'insurance_claims',
    timestamps: true
  });

  return InsuranceClaim;
};
