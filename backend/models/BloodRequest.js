const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BloodRequest = sequelize.define('BloodRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    hospital_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    blood_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    units: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'pending' // pending, fulfilled, cancelled
    },
    urgency: {
      type: DataTypes.STRING,
      defaultValue: 'routine' // routine, urgent, stat
    }
  }, {
    tableName: 'blood_requests',
    timestamps: true
  });

  return BloodRequest;
};
