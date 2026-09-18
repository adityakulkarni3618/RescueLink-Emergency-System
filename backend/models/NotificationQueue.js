const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const NotificationQueue = sequelize.define('NotificationQueue', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    entity_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    event_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    payload: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    delivered_via_socket: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'PENDING'
    }
  }, {
    tableName: 'notification_queue',
    timestamps: true
  });

  return NotificationQueue;
};
