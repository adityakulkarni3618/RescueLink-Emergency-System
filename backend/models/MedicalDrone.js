const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MedicalDrone = sequelize.define('MedicalDrone', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    drone_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    payload_capacity_kg: {
      type: DataTypes.FLOAT,
      defaultValue: 5.0
    },
    battery_pct: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },
    status: {
      type: DataTypes.ENUM('IDLE', 'DISPATCHED', 'RETURNING', 'MAINTENANCE'),
      defaultValue: 'IDLE'
    },
    payload_type: {
      type: DataTypes.ENUM('AED', 'BLOOD_BAG', 'EPI_PEN', 'FIRST_AID'),
      defaultValue: 'AED'
    },
    current_lat: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    current_lng: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    target_lat: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    target_lng: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    assigned_incident_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    speed_kmh: {
      type: DataTypes.FLOAT,
      defaultValue: 65.0
    }
  }, {
    tableName: 'medical_drones',
    timestamps: true
  });

  return MedicalDrone;
};
