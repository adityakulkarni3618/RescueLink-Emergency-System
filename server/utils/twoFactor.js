const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a_very_secure_secret_key_32_characters_long'; // Must be 32 chars
const IV_LENGTH = 16;

/**
 * Encrypts cleartext using AES-256-CBC.
 */
function encryptSecret(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypts ciphertext using AES-256-CBC.
 */
function decryptSecret(text) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('[2FA DECRYPT ERROR]', err.message);
    throw new Error('Failed to decrypt TOTP secret');
  }
}

/**
 * Generates a new 2FA secret for a user and creates a base64 QR code.
 */
async function generateSecret(userId, userEmail) {
  const secret = speakeasy.generateSecret({
    name: `RescueLink:${userEmail}`,
    issuer: 'RescueLink'
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  const encryptedSecret = encryptSecret(secret.base32);

  return {
    secret: encryptedSecret,
    otpauth_url: secret.otpauth_url,
    qr_code_base64: qrCodeDataUrl
  };
}

/**
 * Verifies a TOTP token against the encrypted secret.
 */
function verifyTOTP(encryptedSecret, token) {
  const decrypted = decryptSecret(encryptedSecret);
  return speakeasy.totp.verify({
    secret: decrypted,
    encoding: 'base32',
    token,
    window: 1 // Allow 1 step grace period before/after
  });
}

/**
 * Generates 8 backup recovery codes (each 8 chars long).
 * Returns both plain codes (to show once) and their hashed equivalents.
 */
async function generateBackupCodes() {
  const codes = [];
  const hashedCodes = [];

  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
    codes.push(code);
    const hash = await bcrypt.hash(code, 10);
    hashedCodes.push(hash);
  }

  return {
    plainCodes: codes,
    hashedCodes
  };
}

module.exports = {
  generateSecret,
  verifyTOTP,
  generateBackupCodes,
  encryptSecret,
  decryptSecret
};
