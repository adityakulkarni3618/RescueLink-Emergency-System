const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Ambulance = sequelize.define('Ambulance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    vehicleNo: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    type: {
      type: DataTypes.ENUM('ALS', 'BLS'),
      defaultValue: 'BLS',
      allowNull: false
    },
    driverName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    contactInfo: {
      type: DataTypes.STRING,
      allowNull: false
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    totp_secret: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    verification_status: {
      type: DataTypes.STRING,
      defaultValue: 'PENDING',
      allowNull: false
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    station_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    equipment_checklist: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]'
    },
    crew_members: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]'
    },
    license_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    license_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    is_system_standard: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    oxygen_capacity_liters: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    engine_temp: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    fuel_level: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    battery_voltage: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    diagnostic_fault_codes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]'
    }
  }, {
    tableName: 'ambulances',
    timestamps: true
  });

  return Ambulance;
};
