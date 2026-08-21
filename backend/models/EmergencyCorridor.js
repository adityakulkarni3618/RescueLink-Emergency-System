const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EmergencyCorridor = sequelize.define('EmergencyCorridor', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incident_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    junction_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('SCHEDULED', 'PREEMPTING', 'CORRIDOR_ACTIVE', 'PASSED'),
      defaultValue: 'SCHEDULED'
    },
    eta_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    preempt_window_start: {
      type: DataTypes.DATE,
      allowNull: true
    },
    preempt_window_end: {
      type: DataTypes.DATE,
      allowNull: true
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: false
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: false
    }
  }, {
    tableName: 'emergency_corridors',
    timestamps: true
  });

  return EmergencyCorridor;
};
