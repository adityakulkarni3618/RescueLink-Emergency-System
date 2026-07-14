const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    resource: {
      type: DataTypes.STRING
    },
    resource_id: {
      type: DataTypes.STRING
    },
    ip_address: {
      type: DataTypes.STRING
    },
    severity: {
      type: DataTypes.ENUM('INFO', 'WARNING', 'CRITICAL'),
      defaultValue: 'INFO',
      allowNull: false
    },
    category: {
      type: DataTypes.STRING,
      defaultValue: 'GENERAL',
      allowNull: false
    },
    details: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false, // Audit logs are insert-only
    hooks: {
      beforeUpdate: () => {
        throw new Error('Audit logs are append-only. UPDATE operations are forbidden.');
      },
      beforeDestroy: () => {
        throw new Error('Audit logs are append-only. DELETE operations are forbidden.');
      },
      beforeBulkUpdate: () => {
        throw new Error('Audit logs are append-only. Bulk UPDATE operations are forbidden.');
      },
      beforeBulkDestroy: () => {
        throw new Error('Audit logs are append-only. Bulk DELETE operations are forbidden.');
      }
    }
  });

  return AuditLog;
};
