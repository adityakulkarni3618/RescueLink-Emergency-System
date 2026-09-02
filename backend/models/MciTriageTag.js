const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MciTriageTag = sequelize.define('MciTriageTag', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incident_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    tag_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    nfc_uid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    start_triage_color: {
      type: DataTypes.ENUM('RED', 'YELLOW', 'GREEN', 'BLACK'),
      allowNull: false,
      defaultValue: 'YELLOW'
    },
    patient_age_group: {
      type: DataTypes.ENUM('ADULT', 'PEDIATRIC'),
      defaultValue: 'ADULT'
    },
    victim_name_or_alias: {
      type: DataTypes.STRING,
      defaultValue: 'Unidentified Victim'
    },
    vitals_snapshot: {
      type: DataTypes.JSON,
      allowNull: true
    },
    injury_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assigned_transport_unit: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('ON_SCENE', 'TRANSPORTING', 'DELIVERED_TO_ER'),
      defaultValue: 'ON_SCENE'
    }
  }, {
    tableName: 'mci_triage_tags',
    timestamps: true
  });

  return MciTriageTag;
};
