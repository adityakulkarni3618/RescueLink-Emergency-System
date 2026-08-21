const { initializeApp, cert } = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
const dotenv = require('dotenv');
dotenv.config();

let isFcmInitialized = false;
let messaging = null;

// Check if credentials path exists in environment variables
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (serviceAccountPath) {
  try {
    const fs = require('fs');
    const path = require('path');
    const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
    const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    
    initializeApp({
      credential: cert(serviceAccount)
    });
    
    messaging = getMessaging();
    isFcmInitialized = true;
    console.log('[PUSH NOTIFICATION] Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.error('[PUSH NOTIFICATION ERROR] Failed to initialize Firebase Admin SDK:', err.message);
  }
} else {
  console.log('[PUSH NOTIFICATION] No FIREBASE_SERVICE_ACCOUNT specified in .env. Running in MOCK mode.');
}

/**
 * Sends a push notification to a specific FCM registration token.
 */
async function sendPushNotification(token, title, body, data = {}) {
  if (!token) return;
  
  if (!isFcmInitialized || !messaging) {
    console.log(`[PUSH MOCK] To Token: ${token.slice(0, 10)}... | Title: ${title} | Body: ${body} | Data:`, data);
    return;
  }

  const message = {
    notification: { title, body },
    data,
    token
  };

  try {
    const response = await messaging.send(message);
    console.log('[PUSH NOTIFICATION] Successfully sent message:', response);
    return response;
  } catch (err) {
    console.error('[PUSH NOTIFICATION ERROR] Error sending message:', err.message);
    throw err;
  }
}

/**
 * Sends push notifications to all users subscribed to a specific topic.
 */
async function sendTopicNotification(topic, title, body, data = {}) {
  if (!isFcmInitialized || !messaging) {
    console.log(`[PUSH MOCK] To Topic: ${topic} | Title: ${title} | Body: ${body} | Data:`, data);
    return;
  }

  const message = {
    notification: { title, body },
    data,
    topic
  };

  try {
    const response = await messaging.send(message);
    console.log(`[PUSH NOTIFICATION] Successfully sent message to topic ${topic}:`, response);
    return response;
  } catch (err) {
    console.error(`[PUSH NOTIFICATION ERROR] Error sending message to topic ${topic}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendPushNotification,
  sendTopicNotification
};
