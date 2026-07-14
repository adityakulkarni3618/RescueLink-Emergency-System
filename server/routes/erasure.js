const express = require('express');
const router = express.Router();
const { PendingErasure, Patient, Incident, VitalsHistory, Consent, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const Joi = require('joi');
const { validate } = require('../middleware/validate');

const requestSchema = Joi.object({
  patient_id: Joi.string().required(),
  reason: Joi.string().required()
});

const reviewSchema = Joi.object({
  status: Joi.string().valid('APPROVED', 'REJECTED').required(),
  review_notes: Joi.string().allow('', null).optional()
});

/**
 * @route POST /api/erasure/request
 * @desc File a right-to-erasure request
 */
router.post('/request', verifyToken(), validate(requestSchema), async (req, res) => {
  const { patient_id, reason } = req.body;

  try {
    const patient = await Patient.findByPk(patient_id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const pending = await PendingErasure.create({
      request_by_user_id: req.user.id,
      patient_id,
      reason,
      status: 'PENDING'
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'RIGHT_TO_ERASURE_REQUESTED',
      resource: 'Patient',
      resource_id: patient_id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { requestId: pending.id }
    });

    return res.status(201).json(pending);
  } catch (err) {
    console.error('[ERASURE API] Request error:', err.message);
    return res.status(500).json({ error: 'Failed to request erasure' });
  }
});

/**
 * @route GET /api/erasure/pending
 * @desc Retrieve all pending erasure requests (Admin only)
 */
router.get('/pending', verifyToken(['city_admin', 'hospital_admin']), async (req, res) => {
  try {
    const pendings = await PendingErasure.findAll({
      where: { status: 'PENDING' }
    });
    return res.json(pendings);
  } catch (err) {
    console.error('[ERASURE API] Fetch pending error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch pending erasures' });
  }
});

/**
 * @route POST /api/erasure/review/:id
 * @desc Approve or reject a right-to-erasure request (Admin only)
 */
router.post('/review/:id', verifyToken(['city_admin', 'hospital_admin']), validate(reviewSchema), async (req, res) => {
  const { id } = req.params;
  const { status, review_notes } = req.body;

  try {
    const request = await PendingErasure.findByPk(id);
    if (!request) {
      return res.status(404).json({ error: 'Erasure request not found' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request has already been reviewed' });
    }

    request.status = status;
    request.reviewed_by_user_id = req.user.id;
    request.review_notes = review_notes || '';
    await request.save();

    if (status === 'APPROVED') {
      const patientId = request.patient_id;

      // 1. Audit Log record prior to wiping (exclude PII)
      await AuditLog.create({
        user_id: req.user.id,
        action: 'PATIENT_ERASURE_APPROVED',
        resource: 'Patient',
        resource_id: patientId,
        ip_address: req.ip || req.connection.remoteAddress,
        details: { message: 'Compliance Purge Approved. Deleting linked records.' }
      });

      // 2. Cascade deletions of linked health records
      await Consent.destroy({ where: { patient_id: patientId } });
      
      const incidents = await Incident.findAll({ where: { patient_id: patientId } });
      for (const incident of incidents) {
        await VitalsHistory.destroy({ where: { incident_id: incident.id } });
        await incident.destroy();
      }

      await Patient.destroy({ where: { id: patientId } });

      console.log(`[COMPLIANCE] Erased patient record and associated incidents for patient ${patientId}`);
    } else {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'PATIENT_ERASURE_REJECTED',
        resource: 'Patient',
        resource_id: request.patient_id,
        ip_address: req.ip || req.connection.remoteAddress,
        details: { reason: review_notes }
      });
    }

    return res.json(request);
  } catch (err) {
    console.error('[ERASURE API] Review error:', err.message);
    return res.status(500).json({ error: 'Failed to process erasure review' });
  }
});

module.exports = router;
