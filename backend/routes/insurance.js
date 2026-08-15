const express = require('express');
const router = express.Router();
const pmjayService = require('../utils/pmjay');
const { verifyToken } = require('../middleware/auth');
const { AuditLog } = require('../utils/db');

/**
 * @route POST /api/insurance/pre-approve
 * @desc Verify PMJAY/insurance eligibility and trigger auto-approval
 */
router.post('/pre-approve', verifyToken(), async (req, res) => {
  const { patientName, condition, estimatedCost, hospitalId } = req.body;
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

    // Write audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'INSURANCE_PRE_AUTH',
      resource: 'Incident',
      resource_id: preAuthResult.referenceNo,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { patientName, condition, estimatedCost, status: preAuthResult.status }
    });

    return res.json(preAuthResult);
  } catch (err) {
    console.error('[INSURANCE ROUTE] Error requesting pre-approval:', err.message);
    return res.status(500).json({ error: 'Insurance pre-approval request failed' });
  }
});

module.exports = router;
