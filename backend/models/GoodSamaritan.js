const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GoodSamaritan = sequelize.define('GoodSamaritan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false
    },
    cpr_license_number: {
      type: DataTypes.STRING,
      allowNull: false
    },
    certification_agency: {
      type: DataTypes.STRING,
      defaultValue: 'American Heart Association / Red Cross'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    last_ping: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    alerts_responded: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'good_samaritans',
    timestamps: true
  });

  return GoodSamaritan;
};
