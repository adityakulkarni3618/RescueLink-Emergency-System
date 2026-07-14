const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

/**
 * PMJAY (Ayushman Bharat Scheme) integration service.
 * Handles beneficiary eligibility check, pre-auth verification, and claims processing.
 */
class PMJAYService {
  constructor() {
    this.clientId = process.env.PMJAY_CLIENT_ID || 'MOCK_PMJAY_CLIENT';
    this.clientSecret = process.env.PMJAY_CLIENT_SECRET || 'xxxx-xxxx-xxxx';
    this.gatewayUrl = process.env.PMJAY_GATEWAY_URL || 'https://mock.pmjay.gov.in/api';
    this.isMock = this.clientId === 'MOCK_PMJAY_CLIENT';
  }

  /**
   * Checks if patient is eligible for PMJAY (by national identity number e.g. Aadhaar or PMJAY ID)
   */
  async checkEligibility(nationalId) {
    if (this.isMock) {
      console.log(`[PMJAY MOCK] Eligibility check for national ID: ${nationalId}`);
      // Return mock details
      return {
        eligible: true,
        patientName: 'Karan Singh',
        familyId: 'FAM-PMJAY-99881',
        coverageLeft: 450000, // PMJAY covers up to 5 Lakhs per family per year
        state: 'Uttar Pradesh',
        status: 'ACTIVE'
      };
    }

    try {
      const response = await axios.post(`${this.gatewayUrl}/beneficiary/verify`, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        nationalId
      });
      return response.data;
    } catch (err) {
      console.error('[PMJAY ERROR] Eligibility check failed:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Request pre-authorization for a medical package.
   */
  async requestPreAuth(patientName, condition, estimatedCost, hospitalId) {
    if (this.isMock) {
      console.log(`[PMJAY MOCK] Pre-auth request: Patient="${patientName}", Condition="${condition}", Cost=₹${estimatedCost}`);
      
      const maxCoverage = 500000;
      const coverageAmount = Math.min(estimatedCost, maxCoverage);
      const isApproved = estimatedCost <= maxCoverage;

      return {
        status: isApproved ? 'APPROVED' : 'REJECTED_EXCEEDS_CAP',
        patientName,
        condition,
        estimatedCost,
        coverageAmount: isApproved ? coverageAmount : 0,
        referenceNo: `PMJAY-PRE-${Date.now()}`,
        hospitalId,
        message: isApproved 
          ? 'Auto-approved under PMJAY Emergency Packages'
          : 'Package exceeds annual limit or needs manual TPA audit'
      };
    }

    try {
      const response = await axios.post(`${this.gatewayUrl}/preauth/submit`, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        patientName,
        condition,
        estimatedCost,
        hospitalId
      });
      return response.data;
    } catch (err) {
      console.error('[PMJAY ERROR] Pre-auth submission failed:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Submits claims post discharge.
   */
  async submitClaim(preAuthRef, actualCost, billsJson) {
    if (this.isMock) {
      console.log(`[PMJAY MOCK] Claim submitted for pre-auth ref: ${preAuthRef}, actual cost: ₹${actualCost}`);
      return {
        claimId: `CLAIM-PMJAY-${Date.now()}`,
        status: 'SUBMITTED',
        settledAmount: actualCost,
        transactionDate: new Date().toISOString()
      };
    }

    try {
      const response = await axios.post(`${this.gatewayUrl}/claims/submit`, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        preAuthRef,
        actualCost,
        bills: billsJson
      });
      return response.data;
    } catch (err) {
      console.error('[PMJAY ERROR] Claim submission failed:', err.response?.data || err.message);
      throw err;
    }
  }
}

module.exports = new PMJAYService();
