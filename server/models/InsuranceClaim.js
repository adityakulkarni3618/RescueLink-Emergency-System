const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InsuranceClaim = sequelize.define('InsuranceClaim', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incident_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    policy_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    claim_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'submitted' // submitted, approved, rejected
    }
  }, {
    tableName: 'insurance_claims',
    timestamps: true
  });

  return InsuranceClaim;
};
