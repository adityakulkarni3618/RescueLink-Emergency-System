// config.js
// Secure configuration manager: validates cryptographic secrets, APP_MODE, and environment parameters
// If running under Jest test runner (NODE_ENV === 'test'), enforce test mode unless explicitly testing another mode
if (process.env.NODE_ENV === 'test') {
  process.env.APP_MODE = process.env.TEST_APP_MODE || 'test';
}

const appMode = (process.env.APP_MODE || (process.env.NODE_ENV === 'production' ? 'production' : 'development')).toLowerCase();
const jwtSecret = process.env.JWT_SECRET;
const encryptionKey = process.env.ENCRYPTION_KEY;

function validateAppSecurity(mode = appMode) {
  const isStrict = mode === 'production' || mode === 'pilot' || process.env.NODE_ENV === 'production';
  const currentJwt = process.env.JWT_SECRET !== undefined ? process.env.JWT_SECRET : jwtSecret;
  const currentEnc = process.env.ENCRYPTION_KEY !== undefined ? process.env.ENCRYPTION_KEY : encryptionKey;
  
  if (isStrict) {
    // Validate JWT Secret strength in production/pilot
    if (!currentJwt || currentJwt.length < 32 || currentJwt.includes('change_this_in_production')) {
      console.error(`[FATAL SECURITY ERROR] JWT_SECRET is missing, too short (<32 chars), or uses committed defaults in ${mode} mode. Refusing to boot server.`);
      process.exit(1);
    }

    // Validate Application-layer Encryption Key strength in production/pilot
    if (!currentEnc || currentEnc.length < 32 || currentEnc.includes('2b7e151628aed2a6abf7158809cf4f3c')) {
      console.error(`[FATAL SECURITY ERROR] ENCRYPTION_KEY is missing or uses default committed values in ${mode} mode. Refusing to boot server.`);
      process.exit(1);
    }

    // Validate Twilio keys in production/pilot if configured
    if (process.env.TWILIO_ACCOUNT_SID === 'your_twilio_sid') {
      console.error(`[FATAL SECURITY ERROR] TWILIO_ACCOUNT_SID uses committed placeholder in ${mode} mode. Refusing to boot server.`);
      process.exit(1);
    }
  } else {
    // Developer warnings
    if (!jwtSecret || jwtSecret.includes('change_this_in_production')) {
      console.warn('[SECURITY WARNING] Using weak or default JWT_SECRET. Do not deploy to staging or production with this setup.');
    }
    if (!encryptionKey || encryptionKey.includes('2b7e151628aed2a6abf7158809cf4f3c')) {
      console.warn('[SECURITY WARNING] Using default ENCRYPTION_KEY. Do not deploy to staging or production with this setup.');
    }
  }
}

// Run initial validation on require
validateAppSecurity();

function isDemoAllowed() {
  return appMode === 'demo' || appMode === 'development';
}

module.exports = {
  APP_MODE: appMode,
  isDemoAllowed,
  validateAppSecurity,
  JWT_SECRET: jwtSecret || 'dev-only-insecure-secret-do-not-use-in-prod_32_chars',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  ENCRYPTION_KEY: encryptionKey || '2b7e151628aed2a6abf7158809cf4f3c2b7e151628aed2a6abf7158809cf4f3c',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || 'mock_account_sid',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || 'mock_auth_token',
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '+15017122661',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_mockKeyId12345',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'mockKeySecret1234567890'
};

