// config.js
// Secure configuration manager: validates cryptographic secrets and environment parameters

const jwtSecret = process.env.JWT_SECRET;
const encryptionKey = process.env.ENCRYPTION_KEY;

if (process.env.NODE_ENV === 'production') {
  // Validate JWT Secret strength in production
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('change_this_in_production')) {
    console.error('[FATAL SECURITY ERROR] JWT_SECRET is missing, too short (<32 chars), or uses committed defaults in production. Refusing to boot server.');
    process.exit(1);
  }

  // Validate Application-layer Encryption Key strength in production
  if (!encryptionKey || encryptionKey.length < 32 || encryptionKey.includes('2b7e151628aed2a6abf7158809cf4f3c')) {
    console.error('[FATAL SECURITY ERROR] ENCRYPTION_KEY is missing or uses default committed values in production. Refusing to boot server.');
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

module.exports = {
  JWT_SECRET: jwtSecret || 'dev-only-insecure-secret-do-not-use-in-prod_32_chars',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m', // Access token expiration (short-lived)
  ENCRYPTION_KEY: encryptionKey || '2b7e151628aed2a6abf7158809cf4f3c2b7e151628aed2a6abf7158809cf4f3c'
};
