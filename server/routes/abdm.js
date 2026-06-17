const express = require('express');
const router = express.Router();
const abdmService = require('../utils/abdm');
const { verifyToken } = require('../middleware/auth');
const { Patient } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');

/**
 * @route POST /api/abdm/verify-address
 * @desc Verify ABHA Address
 */
router.post('/verify-address', verifyToken(), async (req, res) => {
  const { abhaAddress } = req.body;
  if (!abhaAddress) {
    return res.status(400).json({ error: 'ABHA Address is required' });
  }

  try {
    const result = await abdmService.verifyAbhaAddress(abhaAddress);
    return res.json(result);
  } catch (err) {
    console.error('[ABDM ROUTE] Error verifying ABHA Address:', err.message);
    return res.status(500).json({ error: err.message || 'ABHA verification failed' });
  }
});

/**
 * @route POST /api/abdm/aadhaar-otp
 * @desc Initiate Aadhaar OTP for ABHA creation/linking
 */
router.post('/aadhaar-otp', verifyToken(), async (req, res) => {
  const { aadhaar } = req.body;
  if (!aadhaar) {
    return res.status(400).json({ error: 'Aadhaar number is required' });
  }

  try {
    const result = await abdmService.generateAadhaarOtp(aadhaar);
    return res.json(result);
  } catch (err) {
    console.error('[ABDM ROUTE] Error generating Aadhaar OTP:', err.message);
    return res.status(500).json({ error: err.message || 'Aadhaar OTP generation failed' });
  }
});

/**
 * @route POST /api/abdm/consent
 * @desc Create Consent Request to fetch longitudinal records
 */
router.post('/consent', verifyToken(), async (req, res) => {
  const { abhaAddress, purpose } = req.body;
  if (!abhaAddress) {
    return res.status(400).json({ error: 'ABHA Address is required' });
  }

  try {
    const requesterId = req.user.hospital_id || 'RESCUELINK-HIU';
    const result = await abdmService.createConsentRequest(abhaAddress, requesterId, purpose);
    return res.json(result);
  } catch (err) {
    console.error('[ABDM ROUTE] Error creating Consent Request:', err.message);
    return res.status(500).json({ error: err.message || 'Consent Request initiation failed' });
  }
});

/**
 * @route GET /api/abdm/records/:consentId
 * @desc Fetch longitudinal patient health documents
 */
router.get('/records/:consentId', verifyToken(), async (req, res) => {
  const { consentId } = req.params;
  try {
    const records = await abdmService.fetchHealthRecords(consentId);
    return res.json(records);
  } catch (err) {
    console.error('[ABDM ROUTE] Error fetching longitudinal records:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch medical records' });
  }
});

/**
 * @route POST /api/abdm/auth
 * @desc Initiate ABHA Auth
 */
router.post('/auth', verifyToken(), async (req, res) => {
  const { abhaAddress } = req.body;
  if (!abhaAddress) {
    return res.status(400).json({ error: 'ABHA Address is required' });
  }
  try {
    const result = await abdmService.initiateAuth(abhaAddress);
    return res.json(result);
  } catch (err) {
    console.error('[ABDM ROUTE] Error initiating ABHA Auth:', err.message);
    return res.status(500).json({ error: 'Gateway Error', detail: err.message });
  }
});

/**
 * @route POST /api/abdm/verify
 * @desc Confirm/Verify ABHA OTP and link/create patient
 */
router.post('/verify', verifyToken(), async (req, res) => {
  const { transactionId, otp, abhaAddress } = req.body;
  if (!transactionId || !otp || !abhaAddress) {
    return res.status(400).json({ error: 'Transaction ID, OTP, and ABHA Address are required' });
  }
  try {
    const patientData = await abdmService.confirmAuth(transactionId, otp, abhaAddress);
    
    // Create linked longitudinal record in Sequelize
    let patient = await Patient.findOne({ where: { abha_number: abhaAddress } });
    if (!patient) {
      patient = await Patient.create({
        abha_number: abhaAddress,
        name: patientData.name,
        dob: '1990-01-01'
      });
    }

    logAudit('ABHA_VERIFY', `ABHA ${abhaAddress} verified and linked`, { targetAbhaId: abhaAddress });
    return res.json(patient);
  } catch (err) {
    console.error('[ABDM ROUTE] Error confirming ABHA Auth:', err.message);
    return res.status(401).json({ error: 'Invalid OTP', detail: err.message });
  }
});

module.exports = router;
