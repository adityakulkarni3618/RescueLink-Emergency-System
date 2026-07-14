const twilio = require('twilio');
require('dotenv').config();

class WhatsAppService {
  constructor() {
    // These will be loaded from .env in production
    const config = require('./config');
    this.accountSid = config.TWILIO_ACCOUNT_SID;
    this.authToken = config.TWILIO_AUTH_TOKEN;
    this.fromNumber = config.TWILIO_WHATSAPP_FROM;
    
    // We only initialize the client if we have real credentials (or if we want to mock it)
    this.isMock = this.accountSid === 'mock_account_sid' || !this.accountSid.startsWith('AC');
    if (!this.isMock) {
      this.client = twilio(this.accountSid, this.authToken);
    }
  }

  async sendMessage(to, message) {
    if (this.isMock) {
      console.log(`[WHATSAPP MOCK] To: ${to} | Message: ${message}`);
      return;
    }

    try {
      const response = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: `whatsapp:${to}`
      });
      console.log(`[WHATSAPP] Sent to ${to}: ${response.sid}`);
      return response;
    } catch (error) {
      console.error(`[WHATSAPP ERROR] Failed to send to ${to}:`, error.message);
      throw error;
    }
  }

  notifyUserDispatched(userMobile, ambulanceId, etaMins) {
    const message = `🚨 *RescueLink Emergency Alert* \n\nHelp is on the way! Ambulance ${ambulanceId} has been dispatched. \n\n📍 ETA: ~${etaMins} mins. \n\nPlease stay calm.`;
    const notificationQueue = require('./notificationQueue');
    notificationQueue.enqueue(userMobile, message);
  }

  notifyAmbulanceAssigned(driverMobile, reqId, location) {
    const message = `🚑 *New Mission Assigned* \n\nMission ID: ${reqId}\nLocation: ${location.lat}, ${location.lng}\n\nPlease proceed immediately.`;
    const notificationQueue = require('./notificationQueue');
    notificationQueue.enqueue(driverMobile, message);
  }

  notifyHospitalIncoming(hospitalContact, reqId, etaMins) {
    const message = `🏥 *Inbound Emergency Patient* \n\nMission ID: ${reqId}\nETA: ~${etaMins} mins.\n\nPlease prepare the ER. Secure patient records available via Dashboard.`;
    const notificationQueue = require('./notificationQueue');
    notificationQueue.enqueue(hospitalContact, message);
  }
}

module.exports = new WhatsAppService();
