const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_FILE_PATH = process.env.NODE_ENV === 'test' 
  ? path.join(__dirname, '../data/consent_ledger_test.json')
  : path.join(__dirname, '../data/consent_ledger.json');

const KEY_DIR = path.join(__dirname, '../data/keys');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'public.pem');

// Ensure directories exist
if (!fs.existsSync(KEY_DIR)) {
  fs.mkdirSync(KEY_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(LEDGER_FILE_PATH))) {
  fs.mkdirSync(path.dirname(LEDGER_FILE_PATH), { recursive: true });
}

// Load or persist keypair
let privateKey, publicKey;
if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
  privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
} else {
  const keys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  privateKey = keys.privateKey;
  publicKey = keys.publicKey;
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, 'utf8');
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, 'utf8');
}

class ConsentLedger {
  constructor() {
    this.chain = [];
    this.loadLedger();
  }

  loadLedger() {
    if (fs.existsSync(LEDGER_FILE_PATH)) {
      try {
        const raw = fs.readFileSync(LEDGER_FILE_PATH, 'utf8');
        this.chain = JSON.parse(raw);
      } catch (err) {
        console.error('[LEDGER ERROR] Failed to parse consent ledger json. Re-initializing chain.', err.message);
        this.chain = [];
      }
    }

    if (this.chain.length === 0) {
      this.createGenesisBlock();
    }
  }

  saveLedger() {
    try {
      fs.writeFileSync(LEDGER_FILE_PATH, JSON.stringify(this.chain, null, 2), 'utf8');
    } catch (err) {
      console.error('[LEDGER WRITE ERROR] Failed to save block to file.', err.message);
    }
  }

  createGenesisBlock() {
    const genesisBlock = {
      index: 0,
      timestamp: new Date().toISOString(),
      action: 'GENESIS_CHAIN_INITIALIZED',
      patientId: '00000000-0000-0000-0000-000000000000',
      previousHash: '0',
      hash: ''
    };
    genesisBlock.hash = this.calculateHash(genesisBlock);
    genesisBlock.signature = this.signBlock(genesisBlock.hash);
    this.chain = [genesisBlock];
    this.saveLedger();
  }

  calculateHash(block) {
    return crypto
      .createHash('sha256')
      .update(block.index + block.timestamp + block.action + block.patientId + block.previousHash)
      .digest('hex');
  }

  signBlock(hash) {
    const sign = crypto.createSign('SHA256');
    sign.update(hash);
    return sign.sign(privateKey, 'base64');
  }

  verifyBlockSignature(hash, signature) {
    const verify = crypto.createVerify('SHA256');
    verify.update(hash);
    return verify.verify(publicKey, signature, 'base64');
  }

  async appendBlock(patientId, action) {
    const lastBlock = this.chain[this.chain.length - 1];
    const newBlock = {
      index: lastBlock.index + 1,
      timestamp: new Date().toISOString(),
      action: action,
      patientId: patientId,
      previousHash: lastBlock.hash,
      hash: ''
    };

    newBlock.hash = this.calculateHash(newBlock);
    newBlock.signature = this.signBlock(newBlock.hash);
    
    this.chain.push(newBlock);
    this.saveLedger();
    console.log(`[LEDGER] Cryptographic Block #${newBlock.index} appended: ${action} for Patient ${patientId}`);
    return newBlock;
  }

  verifyChainIntegrity() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      // 1. Re-calculate hash and check
      if (currentBlock.hash !== this.calculateHash(currentBlock)) {
        console.error(`[LEDGER INTEGRITY FAILURE] Block #${currentBlock.index} has been altered! Hash mismatch.`);
        return false;
      }

      // 2. Check previous hash reference
      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error(`[LEDGER INTEGRITY FAILURE] Block #${currentBlock.index} previous hash link broken.`);
        return false;
      }

      // 3. Verify digital signature
      const isSignatureValid = this.verifyBlockSignature(currentBlock.hash, currentBlock.signature);
      if (!isSignatureValid) {
        console.error(`[LEDGER INTEGRITY FAILURE] Digital signature on Block #${currentBlock.index} is invalid!`);
        return false;
      }
    }
    console.log(`[LEDGER INTEGRITY OK] Verified ${this.chain.length} blocks. Cryptographic chain is secure and intact.`);
    return true;
  }
}

module.exports = new ConsentLedger();
