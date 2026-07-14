const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VitalsHistory = sequelize.define('VitalsHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    incident_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    heart_rate: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    spo2: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    sbp: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    dbp: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    respiratory_rate: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    news2_value: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'vitals_history',
    timestamps: true
  });

  return VitalsHistory;
};
