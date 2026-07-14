// server/utils/alerting.js
// Production Emergency Incident Alerting Router

const axios = require('axios');
const logger = require('./logger');

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || null;

/**
 * Dispatches critical failure alerts to configured Slack/Webhooks and Winston files.
 * @param {string} subject - Alert subject header
 * @param {object} details - Error parameters
 */
async function triggerCriticalAlert(subject, details = {}) {
  const timestamp = new Date().toISOString();
  const alertPayload = {
    text: `🚨 *CRITICAL FAILURE ALERT: ${subject}*`,
    attachments: [
      {
        color: '#FF0000',
        fields: Object.keys(details).map(key => ({
          title: key,
          value: typeof details[key] === 'object' ? JSON.stringify(details[key]) : String(details[key]),
          short: true
        })),
        footer: `RescueLink Monitor | ${timestamp}`
      }
    ]
  };

  // 1. Send warning to Winston structured logger
  logger.error(`[ALERT HOOK] ${subject}`, details);

  // 2. Dispatch to external endpoint (Slack/Teams webhook)
  if (ALERT_WEBHOOK_URL) {
    try {
      await axios.post(ALERT_WEBHOOK_URL, alertPayload);
      logger.info('[ALERT HOOK] Successfully dispatched alert package.');
    } catch (err) {
      logger.error('[ALERT HOOK ERROR] Failed to dispatch webhook alert:', { error: err.message });
    }
  } else {
    logger.warn('[ALERT HOOK WARN] No ALERT_WEBHOOK_URL defined. Webhook dispatch bypassed.');
  }
}

module.exports = {
  triggerCriticalAlert
};
