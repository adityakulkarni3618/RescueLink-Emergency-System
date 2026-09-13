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
      type: DataTypes.STRING,
      defaultValue: 'NORMAL'
    },
    route_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    distance_from_ambulance: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    distance_from_start: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    eta_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    approach_direction: {
      type: DataTypes.STRING,
      allowNull: true
    },
    required_movement: {
      type: DataTypes.STRING,
      defaultValue: 'Through'
    },
    normal_signal_state: {
      type: DataTypes.STRING,
      defaultValue: 'RED_CYCLE'
    },
    corridor_state: {
      type: DataTypes.STRING,
      defaultValue: 'NORMAL'
    },
    preemption_requested: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    preemption_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    controller_status: {
      type: DataTypes.STRING,
      defaultValue: 'ONLINE'
    },
    gps_confidence: {
      type: DataTypes.STRING,
      defaultValue: 'HIGH'
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
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    },
    route_version: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  }, {
    tableName: 'emergency_corridors',
    timestamps: true
  });

  return EmergencyCorridor;
};

