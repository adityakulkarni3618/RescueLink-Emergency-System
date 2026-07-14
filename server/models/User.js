const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('patient', 'paramedic', 'doctor', 'hospital_admin', 'city_admin', 'family'),
      allowNull: false
    },
    mobile: {
      type: DataTypes.STRING
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    abha_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    fcm_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    totp_secret: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    backup_codes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    refresh_token: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true
  });

  return User;
};
