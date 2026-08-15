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
      defaultValue: true,
      allowNull: false
    }
  }, {
    tableName: 'ambulances',
    timestamps: true
  });

  return Ambulance;
};
