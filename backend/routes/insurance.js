const express = require('express');
const router = express.Router();
const pmjayService = require('../utils/pmjay');
const { verifyToken } = require('../middleware/auth');
const { InsuranceClaim, AuditLog } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');

/**
 * @route POST /api/insurance/pre-approve
 * @desc Verify PMJAY/insurance eligibility and trigger auto-approval
 */
router.post('/pre-approve', verifyToken(), async (req, res) => {
  const { patientName, condition, estimatedCost, hospitalId, abdmAbhaId, icd10Code, policyNumber } = req.body;
  if (!patientName || !condition || estimatedCost === undefined) {
    return res.status(400).json({ error: 'Patient name, condition, and estimated cost are required' });
  }

  try {
    const preAuthResult = await pmjayService.requestPreAuth(
      patientName,
      condition,
      estimatedCost,
      hospitalId
    );

    // Save claim record in database
    const claimRecord = await InsuranceClaim.create({
      claim_reference_no: preAuthResult.referenceNo || `PMJAY-${Date.now()}`,
      patient_name: patientName,
      abdm_abha_id: abdmAbhaId || null,
      policy_number: policyNumber || 'PMJAY-AYUSHMAN-GOVT',
      icd10_code: icd10Code || 'I21.9',
      emergency_condition: condition,
      estimated_cost: parseFloat(estimatedCost),
      approved_amount: preAuthResult.approvedAmount || parseFloat(estimatedCost),
      hospital_id: hospitalId || null,
      status: preAuthResult.status || 'APPROVED'
    });

    await logAudit(
      'INSURANCE',
      'INSURANCE_PRE_AUTH',
      { referenceNo: claimRecord.claim_reference_no, patientName, estimatedCost, status: claimRecord.status },
      'INFO',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({
      ...preAuthResult,
      claimId: claimRecord.id,
      claimReferenceNo: claimRecord.claim_reference_no
    });
  } catch (err) {
    console.error('[INSURANCE ROUTE] Error requesting pre-approval:', err.message);
    return res.status(500).json({ error: 'Insurance pre-approval request failed' });
  }
});

/**
 * @route GET /api/insurance/claims
 * @desc Fetch past pre-authorization claim records
 */
router.get('/claims', verifyToken(), async (req, res) => {
  try {
    const claims = await InsuranceClaim.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    return res.json(claims);
  } catch (err) {
    console.error('[INSURANCE ROUTE] Error fetching claims:', err.message);
    return res.status(500).json({ error: 'Failed to fetch insurance claims' });
  }
});

module.exports = router;
