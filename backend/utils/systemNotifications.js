const { AuditLog } = require('./db');

// In-memory cache for fast socket delivery upon login
const pendingSystemNotifications = {};

/**
 * Add a system notification for a recipient (ambulance unitId, hospitalId, or user)
 */
function createSystemNotification(recipientId, recipientType, title, message, data = {}) {
  if (!recipientId) return;

  const notification = {
    id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    recipientId,
    recipientType, // 'ambulance', 'hospital', 'user'
    title,
    message,
    data,
    createdAt: new Date().toISOString(),
    delivered: false
  };

  if (!pendingSystemNotifications[recipientId]) {
    pendingSystemNotifications[recipientId] = [];
  }
  // Keep up to 20 recent pending notifications per recipient
  pendingSystemNotifications[recipientId].unshift(notification);
  if (pendingSystemNotifications[recipientId].length > 20) {
    pendingSystemNotifications[recipientId].pop();
  }

  console.log(`[SYSTEM NOTIFICATION] Queued notification for ${recipientType}:${recipientId} - ${title}`);

  // Also log to AuditLog for audit trail
  AuditLog.create({
    action: 'SYSTEM_NOTIFICATION_CREATED',
    actorId: 'SYSTEM',
    details: JSON.stringify({ recipientId, recipientType, title, message, reqId: data.reqId || data.id })
  }).catch(e => console.error('[SYSTEM NOTIF AUDIT ERROR]', e.message));

  return notification;
}

/**
 * Get all pending undelivered notifications for a recipient
 */
function getPendingNotifications(recipientId) {
  if (!recipientId || !pendingSystemNotifications[recipientId]) {
    return [];
  }
  return pendingSystemNotifications[recipientId].filter(n => !n.delivered);
}

/**
 * Mark notifications as delivered
 */
function clearDeliveredNotifications(recipientId) {
  if (pendingSystemNotifications[recipientId]) {
    pendingSystemNotifications[recipientId].forEach(n => { n.delivered = true; });
  }
}

module.exports = {
  createSystemNotification,
  getPendingNotifications,
  clearDeliveredNotifications
};
