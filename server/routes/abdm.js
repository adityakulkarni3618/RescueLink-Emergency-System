const express = require('express');
const router = express.Router();
const abdmService = require('../utils/abdm');
const { verifyToken } = require('../middleware/auth');
const { Patient } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');
const { 
  validate, 
  verifyAddressBody, 
  aadhaarOtpBody, 
  consentRequestBody, 
  abdmVerifyBody 
} = require('../middleware/validate');

/**
 * @route POST /api/abdm/verify-address
 * @desc Verify ABHA Address
 */
router.post('/verify-address', verifyToken(), validate(verifyAddressBody), async (req, res) => {
  const { abhaAddress } = req.body;
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
router.post('/aadhaar-otp', verifyToken(), validate(aadhaarOtpBody), async (req, res) => {
  const { aadhaar } = req.body;
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
router.post('/consent', verifyToken(), validate(consentRequestBody), async (req, res) => {
  const { abhaAddress, purpose } = req.body;
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
router.post('/auth', verifyToken(), validate(verifyAddressBody), async (req, res) => {
  const { abhaAddress } = req.body;
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
router.post('/verify', verifyToken(), validate(abdmVerifyBody), async (req, res) => {
  const { transactionId, otp, abhaAddress } = req.body;
  try {
    const patientData = await abdmService.confirmAuth(transactionId, otp, abhaAddress);
    
    // Create linked longitudinal record in Sequelize
    const whereClause = { abha_number: abhaAddress };
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    let patient = await Patient.findOne({ where: whereClause });
    if (!patient) {
      patient = await Patient.create({
        abha_number: abhaAddress,
        name: patientData.name,
        dob: '1990-01-01',
        hospital_id: req.user.hospital_id || null
      });
    }

    logAudit('ABHA_VERIFY', `ABHA ${abhaAddress} verified and linked`, { targetAbhaId: abhaAddress });
    return res.json(patient);
  } catch (err) {
    console.error('[ABDM ROUTE] Error confirming ABHA Auth:', err.message);
    return res.status(401).json({ error: 'Invalid OTP', detail: err.message });
  }
});

/**
 * @route POST /api/abdm/v0.5/consents/hip/notify
 * @desc ABDM Gateway webhook: Consent Manager notifies HIP of consent status changes
 * @see https://sandbox.abdm.gov.in/docs/consent_flow
 */
router.post('/v0.5/consents/hip/notify', async (req, res) => {
  const { notification } = req.body;
  console.log('[ABDM CALLBACK] Received HIP Consent Notification:', JSON.stringify(req.body));
  
  try {
    // 1. Log the notification callback details into AuditLog
    await logAudit(
      'ABDM_CALLBACK',
      'CONSENT_HIP_NOTIFY',
      { notificationId: notification?.consentId, status: notification?.status, consentDetail: notification?.consentDetail },
      'INFO',
      null,
      req.ip
    );

    // 2. Respond immediately to the gateway with a 202 Accepted per ABDM spec
    return res.status(202).send();
  } catch (err) {
    console.error('[ABDM CALLBACK ERROR] HIP Consent Notify error:', err.message);
    return res.status(500).json({ error: 'Callback processing failed' });
  }
});

/**
 * @route POST /api/abdm/v0.5/health-information/hip/request
 * @desc ABDM Gateway webhook: Requests data transfer from HIP under an approved consent
 * @see https://sandbox.abdm.gov.in/docs/data_transfer
 */
router.post('/v0.5/health-information/hip/request', async (req, res) => {
  const { transactionId, hiRequest } = req.body;
  console.log('[ABDM CALLBACK] Received Health Information Request:', JSON.stringify(req.body));
  
  try {
    await logAudit(
      'ABDM_CALLBACK',
      'HI_REQUEST_RECEIVED',
      { transactionId, consentId: hiRequest?.consent?.id, dataPushUrl: hiRequest?.dataPushUrl },
      'INFO',
      null,
      req.ip
    );

    // TODO: In a production gateway, trigger the async push of encrypted FHIR Bundle (via AES-GCM-256 / Diffie-Hellman)
    // back to the hiRequest.dataPushUrl and then call /v0.5/health-information/hip/on-request on the gateway.
    console.log(`[ABDM DATA FLOW] Gateway expects data package pushed to: ${hiRequest?.dataPushUrl}`);
    
    return res.status(202).send();
  } catch (err) {
    console.error('[ABDM CALLBACK ERROR] HI request processing failed:', err.message);
    return res.status(500).json({ error: 'Request processing failed' });
  }
});

/**
 * @route POST /api/abdm/v0.5/links/link/init
 * @desc ABDM Gateway webhook: Initiates discovery and linking of care contexts
 */
router.post('/v0.5/links/link/init', async (req, res) => {
  const { transactionId, patient } = req.body;
  console.log('[ABDM CALLBACK] Care Context Link Init request:', JSON.stringify(req.body));
  
  try {
    await logAudit(
      'ABDM_CALLBACK',
      'LINK_CARE_CONTEXT_INIT',
      { transactionId, patientId: patient?.id, referenceNumber: patient?.referenceNumber },
      'INFO',
      null,
      req.ip
    );

    // Respond with 202 Accepted. Real verification involves sending OTP and firing /on-init callback to gateway
    return res.status(202).send();
  } catch (err) {
    console.error('[ABDM CALLBACK ERROR] Link init failed:', err.message);
    return res.status(500).json({ error: 'Link initialization failed' });
  }
});

/**
 * @route POST /api/abdm/v0.5/links/link/confirm
 * @desc ABDM Gateway webhook: Confirms care context link after OTP verification
 */
router.post('/v0.5/links/link/confirm', async (req, res) => {
  const { transactionId, token } = req.body;
  console.log('[ABDM CALLBACK] Care Context Link Confirm request:', JSON.stringify(req.body));
  
  try {
    await logAudit(
      'ABDM_CALLBACK',
      'LINK_CARE_CONTEXT_CONFIRM',
      { transactionId, token },
      'INFO',
      null,
      req.ip
    );

    // Respond with 202 Accepted. Confirm link and call /on-confirm callback to gateway
    return res.status(202).send();
  } catch (err) {
    console.error('[ABDM CALLBACK ERROR] Link confirm failed:', err.message);
    return res.status(500).json({ error: 'Link confirmation failed' });
  }
});

module.exports = router;
