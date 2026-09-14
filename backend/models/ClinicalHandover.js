const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ClinicalHandover = sequelize.define('ClinicalHandover', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incident_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    paramedic_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    receiving_clinician_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    chief_complaint: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    vitals_snapshot: {
      type: DataTypes.JSON,
      allowNull: true
    },
    news2_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    interventions_given: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    clinical_observations: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED'),
      defaultValue: 'SUBMITTED'
    },
    submitted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    acknowledged_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'clinical_handovers',
    timestamps: true,
    hooks: {
      beforeUpdate: (handover) => {
        if (handover.previous('status') === 'ACKNOWLEDGED') {
          throw new Error('Completed clinical handovers are immutable and cannot be modified.');
        }
      }
    }
  });

  return ClinicalHandover;
};
