process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_rescuelink_jest_tests_32_chars';

const { encrypt, decrypt } = require('../utils/encryption');

describe('Database Layer Verification Tests', () => {
  describe('Application Layer Cryptography (PII/PHI)', () => {
    it('should correctly encrypt and decrypt patient names and mobile numbers', () => {
      const originalText = 'Aditya Kulkarni';
      const encrypted = encrypt(originalText);
      expect(encrypted).not.toBe(originalText);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should handle empty or malformed decrypt inputs gracefully', () => {
      expect(decrypt('')).toBe('');
      expect(() => decrypt('invalid_string')).toThrow();
    });
  });

  describe('AuditLog Append-Only Enforcement Model Hooks', () => {
    it('should prevent updating or deleting audit logs in the DB', async () => {
      const { AuditLog } = require('../utils/db');
      
      const log = await AuditLog.create({
        action: 'TEST_HOOK_ENFORCE',
        severity: 'INFO'
      });

      log.action = 'MUTATED';
      await expect(log.save()).rejects.toThrow('Audit logs are append-only');
      await expect(log.destroy()).rejects.toThrow('Audit logs are append-only');
    });
  });
});
