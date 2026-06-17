const express = require('express');
const router = express.Router();
const { PendingErasure, Patient, User } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const { logAudit } = require('../utils/auditLogger');

/**
 * @route POST /api/erasure/request
 * @desc Create a new erasure request for a patient record
 * @access Private
 */
router.post('/request', verifyToken(), async (req, res) => {
  const { patientId, reason } = req.body;
  if (!patientId || !reason) {
    return res.status(400).json({ error: 'Patient ID and reason are required' });
  }

  try {
    const whereClause = { id: patientId };
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const patient = await Patient.findOne({ where: whereClause });
    if (!patient) return res.status(404).json({ error: 'Patient record not found' });

    const request = await PendingErasure.create({
      request_by_user_id: req.user.id,
      patient_id: patientId,
      reason,
      status: 'PENDING'
    });

    await logAudit(
      'CONSENT',
      'ERASURE_REQUESTED',
      { patientId, request_id: request.id, reason },
      'WARNING',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.status(201).json({
      message: 'Erasure request submitted successfully and is pending administrator review.',
      request
    });
  } catch (err) {
    console.error('[ERASURE REQUEST ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to submit erasure request' });
  }
});

/**
 * @route GET /api/erasure/requests
 * @desc Get all erasure requests
 * @access Private (city_admin)
 */
router.get('/requests', verifyToken(['city_admin']), async (req, res) => {
  try {
    const requests = await PendingErasure.findAll({
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Patient,
          as: 'patient',
          attributes: ['id', 'name', 'abha_number']
        }
      ]
    });
    return res.json(requests);
  } catch (err) {
    console.error('[ERASURE LIST ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to fetch erasure requests' });
  }
});

/**
 * @route POST /api/erasure/approve/:id
 * @desc Approve and execute anonymization of patient record
 * @access Private (city_admin)
 */
router.post('/approve/:id', verifyToken(['city_admin']), async (req, res) => {
  const { reviewNotes } = req.body;
  try {
    const request = await PendingErasure.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Erasure request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request already processed. Current status: ${request.status}` });
    }

    const patient = await Patient.findByPk(request.patient_id);
    if (patient) {
      // DPDP COMPLIANT ANONYMIZATION
      // Overwrite PII fields to completely remove identifying information while preserving statistical metrics
      patient.name = 'ANONYMOUS PATIENT';
      patient.name_masked = 'A*** P***';
      patient.dob = null;
      patient.abha_number = null;
      patient.emergency_contact_name = 'DELETED';
      patient.emergency_contact_mobile = '0000000000';
      
      // Save changes (hooks will automatically trigger but we are writing safe values)
      await patient.save();
    }

    request.status = 'APPROVED';
    request.reviewed_by_user_id = req.user.id;
    request.review_notes = reviewNotes || 'Approved by system administrator';
    await request.save();

    await logAudit(
      'CONSENT',
      'ERASURE_APPROVED',
      { 
        requestId: request.id,
        patientId: request.patient_id,
        reviewNotes
      },
      'CRITICAL',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({
      message: 'Erasure request approved. Patient data anonymized successfully.',
      request
    });
  } catch (err) {
    console.error('[ERASURE APPROVE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to approve erasure request' });
  }
});

/**
 * @route POST /api/erasure/reject/:id
 * @desc Reject erasure request of patient record
 * @access Private (city_admin)
 */
router.post('/reject/:id', verifyToken(['city_admin']), async (req, res) => {
  const { reviewNotes } = req.body;
  if (!reviewNotes) return res.status(400).json({ error: 'Review notes are required for rejection' });

  try {
    const request = await PendingErasure.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Erasure request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Request already processed. Current status: ${request.status}` });
    }

    request.status = 'REJECTED';
    request.reviewed_by_user_id = req.user.id;
    request.review_notes = reviewNotes;
    await request.save();

    await logAudit(
      'CONSENT',
      'ERASURE_REJECTED',
      { 
        requestId: request.id,
        patientId: request.patient_id,
        reviewNotes
      },
      'WARNING',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({
      message: 'Erasure request rejected successfully.',
      request
    });
  } catch (err) {
    console.error('[ERASURE REJECT ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to reject erasure request' });
  }
});

module.exports = router;
