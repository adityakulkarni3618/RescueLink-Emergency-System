const smpp = require('smpp');

const SMPP_HOST = process.env.SMPP_HOST || null;
const SMPP_PORT = process.env.SMPP_PORT || 2775;
const SMPP_SYSTEM_ID = process.env.SMPP_SYSTEM_ID || 'rescuelink';
const SMPP_PASSWORD = process.env.SMPP_PASSWORD || 'password';
const SMPP_SOURCE_ADDR = process.env.SMPP_SOURCE_ADDR || '123456'; // Official shortcode

/**
 * Send SMS using official SMPP v3.4 telecom protocol
 */
async function sendSMS(recipient, message) {
  if (!SMPP_HOST) {
    console.log(`[SMS-SMPP MOCK ALERT] Recipient: ${recipient} | Msg: "${message}"`);
    return { success: true, mock: true };
  }

  return new Promise((resolve, reject) => {
    const session = smpp.connect({
      url: `smpp://${SMPP_HOST}:${SMPP_PORT}`,
      auto_reconnect: true
    });

    session.on('connect', () => {
      session.bind_transceiver({
        system_id: SMPP_SYSTEM_ID,
        password: SMPP_PASSWORD
      }, (pdu) => {
        if (pdu.command_status !== 0) {
          session.close();
          return reject(new Error(`SMPP Bind failed: status code ${pdu.command_status}`));
        }

        // Emit Short Message PDU
        session.submit_sm({
          destination_addr: recipient.replace(/[\s\-\+]+/g, ''),
          source_addr: SMPP_SOURCE_ADDR,
          short_message: message
        }, (submitPdu) => {
          session.close();
          if (submitPdu.command_status === 0) {
            resolve({ success: true, messageId: submitPdu.message_id });
          } else {
            reject(new Error(`SMPP Submit failed: status code ${submitPdu.command_status}`));
          }
        });
      });
    });

    session.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  sendSMS
};
