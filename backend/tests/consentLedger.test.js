const consentLedger = require('../utils/consentLedger');

describe('Cryptographic Consent Ledger Tests', () => {
  beforeAll(() => {
    consentLedger.createGenesisBlock();
  });

  it('should successfully initialize the chain with a genesis block', () => {
    expect(consentLedger.chain.length).toBeGreaterThan(0);
    expect(consentLedger.chain[0].index).toBe(0);
    expect(consentLedger.chain[0].action).toBe('GENESIS_CHAIN_INITIALIZED');
  });

  it('should append new blocks to the ledger and verify integrity successfully', async () => {
    const patientId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3d4b1d';
    await consentLedger.appendBlock(patientId, 'CONSENT_GRANTED');
    await consentLedger.appendBlock(patientId, 'CONSENT_REVOKED');

    const isValid = consentLedger.verifyChainIntegrity();
    expect(isValid).toBe(true);
  });

  it('should detect unauthorized data modifications and fail chain verification', async () => {
    const patientId = '8b1deb4d-3b7d-4bad-9bdd-2b0d7b3d4b1d';
    await consentLedger.appendBlock(patientId, 'CONSENT_REVOKED');

    // Attempt to tamper with the last block data
    const lastBlockIndex = consentLedger.chain.length - 1;
    const originalAction = consentLedger.chain[lastBlockIndex].action;
    
    // Maliciously modify block data without recalculating hashes or signatures
    consentLedger.chain[lastBlockIndex].action = 'CONSENT_GRANTED_FRAUDULENTLY';

    const isValid = consentLedger.verifyChainIntegrity();
    expect(isValid).toBe(false);

    // Restore original state for cleanliness
    consentLedger.chain[lastBlockIndex].action = originalAction;
  });
});
