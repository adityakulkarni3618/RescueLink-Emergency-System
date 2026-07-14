const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PendingErasure = sequelize.define('PendingErasure', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    request_by_user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      defaultValue: 'PENDING',
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false
    },
    reviewed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    review_notes: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'pending_erasures',
    timestamps: true
  });

  return PendingErasure;
};
