const twilio = require('twilio');
require('dotenv').config();

class WhatsAppService {
  constructor() {
    // These will be loaded from .env in production
    const config = require('./config');
    this.accountSid = config.TWILIO_ACCOUNT_SID;
    this.authToken = config.TWILIO_AUTH_TOKEN;
    this.fromNumber = config.TWILIO_WHATSAPP_FROM;
    this.smsFromNumber = config.TWILIO_PHONE_NUMBER;
    
    // We only initialize the client if we have real credentials (or if we want to mock it)
    this.isMock = this.accountSid === 'mock_account_sid' || !this.accountSid.startsWith('AC');
    if (!this.isMock) {
      this.client = twilio(this.accountSid, this.authToken);
    }
  }

  async sendSMS(to, message) {
    if (this.isMock) {
      console.log(`[SMS MOCK] To: ${to} | Message: ${message}`);
      return;
    }

    const cleanTo = to.replace(/[^\d+]/g, '');

    try {
      const response = await this.client.messages.create({
        body: message,
        from: this.smsFromNumber,
        to: cleanTo
      });
      console.log(`[SMS] Sent to ${cleanTo}: ${response.sid}`);
      return response;
    } catch (error) {
      console.error(`[SMS ERROR] Failed to send to ${cleanTo}:`, error.message);
      throw error;
    }
  }

  async sendMessage(to, message) {
    if (this.isMock) {
      console.log(`[WHATSAPP MOCK] To: ${to} | Message: ${message}`);
      return;
    }

    // Clean number: strip everything except '+' and digits
    const cleanTo = to.replace(/[^\d+]/g, '');
    const toParam = `whatsapp:${cleanTo}`;
    
    // Ensure the sender number is prefixed with 'whatsapp:'
    let fromParam = this.fromNumber;
    if (!fromParam.startsWith('whatsapp:')) {
      fromParam = `whatsapp:${fromParam}`;
    }

    try {
      const response = await this.client.messages.create({
        body: message,
        from: fromParam,
        to: toParam
      });
      console.log(`[WHATSAPP] Sent to ${cleanTo}: ${response.sid}`);
      return response;
    } catch (error) {
      console.error(`[WHATSAPP ERROR] Failed to send to ${cleanTo}:`, error.message);
      throw error;
    }
  }

  notifyUserDispatched(userMobile, ambulanceId, etaMins) {
    const formatted = formatE164(userMobile);
    const message = `🚨 *RescueLink Emergency Alert* \n\nHelp is on the way! Ambulance ${ambulanceId} has been dispatched. \n\n📍 ETA: ~${etaMins} mins. \n\nPlease stay calm.`;
    const notificationQueue = require('./notificationQueue');
    notificationQueue.enqueue(formatted, message);
  }

  notifyAmbulanceAssigned(driverMobile, reqId, location) {
    const formatted = formatE164(driverMobile);
    const message = `🚑 *New Mission Assigned* \n\nMission ID: ${reqId}\nLocation: ${location.lat}, ${location.lng}\n\nPlease proceed immediately.`;
    const notificationQueue = require('./notificationQueue');
    notificationQueue.enqueue(formatted, message);
  }

  notifyHospitalIncoming(hospitalContact, reqId, etaMins) {
    const formatted = formatE164(hospitalContact);
    const message = `🏥 *Inbound Emergency Patient* \n\nMission ID: ${reqId}\nETA: ~${etaMins} mins.\n\nPlease prepare the ER. Secure patient records available via Dashboard.`;
    const notificationQueue = require('./notificationQueue');
    notificationQueue.enqueue(formatted, message);
  }
}

function formatE164(phone) {
  if (!phone) return '';
  // Strip all hyphens, spaces, parentheses, etc. keep only + and digits
  let cleaned = phone.trim().replace(/[^\d+]/g, '');
  
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  let digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) {
    return '+91' + digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return '+' + digits;
  }
  return '+' + digits;
}

module.exports = new WhatsAppService();
