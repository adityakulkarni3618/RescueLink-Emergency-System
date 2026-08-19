const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
dotenv.config();

/**
 * ABDM Dev Sandbox integration wrapper.
 * Handles ABHA address creation, OTP verification, consent flows, and FHIR data pushes.
 */
class ABDMService {
  constructor() {
    this.clientId = process.env.ABDM_CLIENT_ID || 'SBX_000000';
    this.clientSecret = process.env.ABDM_CLIENT_SECRET || 'xxxx-xxxx-xxxx-xxxx';
    this.gatewayUrl = 'https://dev.abdm.gov.in/gateway';
    this.isLive = !!(process.env.ABDM_CLIENT_ID && process.env.ABDM_CLIENT_SECRET && process.env.ABDM_CLIENT_ID !== 'SBX_000000');
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Refreshes the ABDM Session Access Token.
   */
  async getAccessToken() {
    if (!this.isLive) {
      console.log('[ABDM MOCK] Mock Mode Access Token Requested');
      return 'mock_access_token';
    }

    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(`${this.gatewayUrl}/v0.5/sessions`, {
        clientId: this.clientId,
        clientSecret: this.clientSecret
      });
      this.accessToken = response.data.accessToken;
      // Expires in 50 minutes
      this.tokenExpiry = Date.now() + 50 * 60 * 1000;
      console.log('[ABDM] Refreshed Gateway Access Token');
      return this.accessToken;
    } catch (err) {
      console.error('[ABDM ERROR] Access Token request failed:', err.response?.data || err.message);
      throw new Error('ABDM Gateway Authentication Failed');
    }
  }

  /**
   * Verifies ABHA number or address.
   */
  async verifyAbhaAddress(abhaAddress) {
    if (!this.isLive) {
      console.log(`[ABDM MOCK] Verifying ABHA address: ${abhaAddress}`);
      // Simulate verification based on ABHA address pattern
      if (abhaAddress.includes('invalid')) {
        return { verified: false, error: 'ABHA Address not found' };
      }
      return {
        verified: true,
        abhaAddress,
        name: 'Jane Doe',
        gender: 'F',
        dob: '1992-08-24',
        mobile: '+919876543210',
        healthIdNumber: '91-1234-5678-9012'
      };
    }

    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${this.gatewayUrl}/v0.5/users/auth/on-confirm`,
        {
          requestId: `REQ-${Date.now()}`,
          timestamp: new Date().toISOString(),
          query: { id: abhaAddress, purpose: 'LINK', authMode: 'MOBILE_OTP' }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-CM-ID': 'sbx'
          }
        }
      );
      return response.data;
    } catch (err) {
      console.error(`[ABDM ERROR] ABHA Address ${abhaAddress} verification failed:`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Triggers an Aadhaar OTP verification to link health records.
   */
  async generateAadhaarOtp(aadhaarNumber) {
    if (!this.isLive) {
      console.log(`[ABDM MOCK] Generating Aadhaar OTP for: ${aadhaarNumber.slice(-4)}`);
      return { transactionId: `TXN-AADHAAR-${Date.now()}`, mode: 'SIMULATED' };
    }

    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${this.gatewayUrl}/v1/registration/aadhaar/generateOtp`,
        { aadhaar: aadhaarNumber },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-CM-ID': 'sbx'
          }
        }
      );
      return { transactionId: response.data.transactionId, mode: 'ACTUAL' };
    } catch (err) {
      console.error('[ABDM ERROR] Generate Aadhaar OTP failed:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Initializes Consent Consent Request flow.
   */
  async createConsentRequest(abhaAddress, requesterId, purpose = 'EMERGENCY') {
    if (!this.isLive) {
      console.log(`[ABDM MOCK] Consent requested for ${abhaAddress} by ${requesterId}`);
      return { consentId: `CONSENT-${Date.now()}`, status: 'REQUESTED' };
    }

    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${this.gatewayUrl}/v0.5/consent-requests/init`,
        {
          requestId: `REQ-${Date.now()}`,
          timestamp: new Date().toISOString(),
          consent: {
            purpose: { code: purpose },
            patient: { id: abhaAddress },
            hiu: { id: requesterId },
            requester: {
              name: 'Dr. Command RescueLink',
              identifier: { type: 'REGNO', value: 'REG-12345' }
            },
            hiTypes: ['OPConsultation', 'Prescription', 'DischargeSummary', 'DiagnosticReport'],
            permission: {
              accessMode: 'VIEW',
              dateRange: {
                from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString()
              },
              dataEraseAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
              frequency: { unit: 'HOUR', value: 1, repeats: 48 }
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-CM-ID': 'sbx'
          }
        }
      );
      return response.data;
    } catch (err) {
      console.error('[ABDM ERROR] Consent Request initialization failed:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Fetches longitudinal health records (FHIR bundles) once consent is approved.
   */
  async fetchHealthRecords(consentId) {
    if (!this.isLive) {
      console.log(`[ABDM MOCK] Fetching FHIR bundles for consent ID: ${consentId}`);
      return {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'pat-123',
              name: [{ text: 'Jane Doe' }],
              gender: 'female'
            }
          },
          {
            resource: {
              resourceType: 'Observation',
              status: 'final',
              code: { text: 'SpO2' },
              valueQuantity: { value: 98, unit: '%' }
            }
          }
        ]
      };
    }

    // Live gateway flow fetches health data through the HIU endpoint
    try {
      const token = await this.getAccessToken();
      const response = await axios.post(
        `${this.gatewayUrl}/v0.5/health-information/hiu/request`,
        {
          requestId: `REQ-${Date.now()}`,
          timestamp: new Date().toISOString(),
          hiInformation: {
            consent: { id: consentId },
            dateRange: {
              from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              to: new Date().toISOString()
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-CM-ID': 'sbx'
          }
        }
      );
      return response.data;
    } catch (err) {
      console.error(`[ABDM ERROR] Failed to fetch health info for consent ${consentId}:`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Ported inline auth method for initiating ABHA authentication flow.
   */
  async initiateAuth(abhaAddress) {
    const token = await this.getAccessToken();
    if (!this.isLive) {
      console.log(`[ABDM MOCK] Requested auth for ${abhaAddress}`);
      return { status: "SUCCESS", transactionId: `TXN-${Date.now()}` };
    }
    const response = await axios.post(`${this.gatewayUrl}/v0.5/users/auth/fetch-modes`, 
      {
        requestId: `REQ-${Date.now()}`,
        timestamp: new Date().toISOString(),
        query: { id: abhaAddress, purpose: "LINK" }
      },
      { headers: { 'Authorization': `Bearer ${token}`, 'X-CM-ID': 'sbx' } }
    );
    return { status: "SUCCESS", transactionId: response.data.transactionId || `TXN-${Date.now()}` };
  }

  /**
   * Ported inline verification method for confirming ABHA OTP.
   */
  async confirmAuth(transactionId, otp, abhaAddress) {
    let patientName = 'ABDM Patient';
    let patientGender = 'U';
    
    const token = await this.getAccessToken();
    if (this.isLive) {
      const response = await axios.post(`${this.gatewayUrl}/v0.5/users/auth/on-confirm`, 
        {
          requestId: `REQ-${Date.now()}`,
          timestamp: new Date().toISOString(),
          transactionId: transactionId,
          credential: { authCode: otp }
        },
        { headers: { 'Authorization': `Bearer ${token}`, 'X-CM-ID': 'sbx' } }
      );
      patientName = response.data.auth?.patient?.name || patientName;
      patientGender = response.data.auth?.patient?.gender || patientGender;
    }

    return { name: patientName, gender: patientGender };
  }

  /**
   * Encrypts data using ECDH shared secret with a receiver's raw public key.
   * @param {string|object} data Data to encrypt.
   * @param {string} receiverPublicKeyHex Public key of the receiver in hex format.
   * @returns {object} { encryptedData, tag, iv, salt, senderPublicKey }
   */
  encryptWithECDH(data, receiverPublicKeyHex) {
    const stringData = typeof data === 'string' ? data : JSON.stringify(data);
    const sender = crypto.createECDH('prime256v1');
    sender.generateKeys();
    
    const sharedSecret = sender.computeSecret(Buffer.from(receiverPublicKeyHex, 'hex'));
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const key = crypto.hkdfSync('sha256', sharedSecret, salt, Buffer.from('ABDM-Data-Transfer', 'utf-8'), 32);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(stringData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    
    return {
      encryptedData: encrypted,
      tag: tag,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      senderPublicKey: sender.getPublicKey('hex')
    };
  }

  /**
   * Decrypts data using ECDH shared secret with a sender's public key.
   * @param {string} encryptedData 
   * @param {string} tag 
   * @param {string} ivHex 
   * @param {string} saltHex 
   * @param {string} senderPublicKeyHex 
   * @param {string} receiverPrivateKeyPem Private key of the receiver (PEM).
   * @returns {string} Decrypted string.
   */
  decryptWithECDH(encryptedData, tag, ivHex, saltHex, senderPublicKeyHex, receiverPrivateKeyPem) {
    const sharedSecret = crypto.diffieHellman({
      privateKey: crypto.createPrivateKey(receiverPrivateKeyPem),
      publicKey: crypto.createPublicKey({
        key: Buffer.from(senderPublicKeyHex, 'hex'),
        format: 'der',
        type: 'spki'
      })
    });
    
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.hkdfSync('sha256', sharedSecret, salt, Buffer.from('ABDM-Data-Transfer', 'utf-8'), 32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

module.exports = new ABDMService();
