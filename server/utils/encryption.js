const forge = require('node-forge');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a_very_secure_secret_key_32_characters_long'; // Should be 32 bytes

/**
 * Encrypts a string using AES-GCM-256
 * @param {string} text 
 * @returns {string} ivHex:tagHex:ciphertextHex
 */
function encrypt(text) {
  if (text === null || text === undefined) return text;
  const strText = String(text);
  if (!strText) return strText;
  
  try {
    const keyBytes = ENCRYPTION_KEY.slice(0, 32);
    const ivBytes = forge.random.getBytesSync(12); // 12-byte IV for GCM
    
    const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
    cipher.start({
      iv: ivBytes,
      tagLength: 128
    });
    cipher.update(forge.util.createBuffer(strText, 'utf8'));
    cipher.finish();
    
    const ciphertextHex = cipher.output.toHex();
    const tagHex = cipher.mode.tag.toHex();
    const ivHex = forge.util.bytesToHex(ivBytes);
    
    return `${ivHex}:${tagHex}:${ciphertextHex}`;
  } catch (err) {
    console.error('[ENCRYPTION ERROR]', err.message);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts a cipher text formatted as ivHex:tagHex:ciphertextHex using AES-GCM-256
 * @param {string} encryptedText 
 * @returns {string} cleartext
 */
function decrypt(encryptedText) {
  if (encryptedText === null || encryptedText === undefined) return encryptedText;
  const strText = String(encryptedText);
  if (!strText) return strText;
  
  const parts = strText.split(':');
  if (parts.length !== 3) {
    throw new Error('Decryption failed: Invalid cipher format (must contain iv, tag, and ciphertext)');
  }
  
  const [ivHex, tagHex, ciphertextHex] = parts;
  const keyBytes = ENCRYPTION_KEY.slice(0, 32);
  const ivBytes = forge.util.hexToBytes(ivHex);
  const tagBytes = forge.util.hexToBytes(tagHex);
  const ciphertextBytes = forge.util.hexToBytes(ciphertextHex);
  
  const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);
  decipher.start({
    iv: ivBytes,
    tag: forge.util.createBuffer(tagBytes),
    tagLength: 128
  });
  decipher.update(forge.util.createBuffer(ciphertextBytes));
  const pass = decipher.finish();
  
  if (!pass) {
    throw new Error('Decryption failed: Integrity validation (MAC check) failed');
  }
  
  return decipher.output.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt
};
