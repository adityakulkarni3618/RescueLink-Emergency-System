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

/**
 * Multi-channel active delivery helper for logged in or offline entities
 */
async function notifyEntity(entity, eventType, payload, io = null, activeSocketsByEntityId = new Set()) {
  if (!entity || !entity.id) return;
  const whatsappService = require('./whatsapp');
  const { NotificationQueue } = require('./db');

  const isOnline = activeSocketsByEntityId.has(entity.id) || (entity.vehicleNo && activeSocketsByEntityId.has(entity.vehicleNo));

  // 1. Live socket delivery if online
  if (io) {
    io.to(`entity:${entity.id}`).to(`hospital:${entity.id}`).to(`ambulance:${entity.id}`).emit(eventType, payload);
  }

  // 2. ALWAYS record in NotificationQueue DB table
  try {
    if (NotificationQueue) {
      await NotificationQueue.create({
        entity_id: entity.id,
        event_type: eventType,
        payload: JSON.stringify(payload),
        delivered_via_socket: isOnline,
        status: isOnline ? 'DELIVERED_SOCKET' : 'QUEUED'
      });
    }
  } catch (err) {
    console.warn(`[NOTIFY ENTITY DB QUEUE WARN] ${err.message}`);
  }

  // 3. Web Push API / Device token Push Notification
  if (entity.push_subscription) {
    try {
      const { sendWebPush } = require('./pushNotifications');
      await sendWebPush(entity.push_subscription, {
        title: eventType === 'incoming-case-availability-check'
          ? 'Incoming patient — check availability'
          : 'New emergency dispatch request',
        body: payload.pickupLat && payload.pickupLng
          ? `Patient location: ${payload.pickupLat.toFixed(3)}, ${payload.pickupLng.toFixed(3)}`
          : 'Urgent emergency alert received'
      });
    } catch (pushErr) {
      console.warn(`[NOTIFY ENTITY PUSH WARN] ${pushErr.message}`);
    }
  }

  // 4. WhatsApp & SMS cellular fallback for priority events
  const phone = entity.contact_number || entity.contactInfo || entity.phone;
  if (phone && ['request:incoming', 'incoming-case-availability-check', 'incoming-ambulance-request'].includes(eventType)) {
    try {
      const pickupText = (payload.pickupLat && payload.pickupLng) ? `(${payload.pickupLat.toFixed(4)}, ${payload.pickupLng.toFixed(4)})` : '';
      const msg = `🚨 *RESCUELINK EMERGENCY ALERT*:\nEvent: ${eventType}\nLocation: ${pickupText}\nPlease log into your RescueLink panel to respond.`;
      await whatsappService.sendSMS(phone, msg);
    } catch (smsErr) {
      console.warn(`[NOTIFY ENTITY SMS WARN] ${smsErr.message}`);
    }
  }
}

module.exports = {
  createSystemNotification,
  getPendingNotifications,
  clearDeliveredNotifications,
  notifyEntity
};
