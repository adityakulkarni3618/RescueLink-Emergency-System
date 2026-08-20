const express = require('express');
const router = express.Router();
const { Prescription, Incident, Patient, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');

/**
 * @route POST /api/prescriptions
 * @desc Create a patient discharge prescription for an active/recent incident run
 */
router.post('/', verifyToken(['doctor', 'hospital_admin']), async (req, res) => {
  const { incidentId, patientId, medications, diagnosis, notes, followUpDate } = req.body;
  if (!incidentId) {
    return res.status(400).json({ error: 'Incident ID is required' });
  }

  try {
    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Associated incident run not found' });
    }

    const prescription = await Prescription.create({
      incident_id: incidentId,
      patient_id: patientId || incident.patient_id || null,
      doctor_id: req.user.id,
      hospital_id: req.user.hospital_id,
      medications: JSON.stringify(medications || []),
      diagnosis: diagnosis || '',
      notes: notes || '',
      follow_up_date: followUpDate || ''
    });

    // Write audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'PRESCRIPTION_CREATE',
      resource: 'Prescription',
      resource_id: prescription.id,
      ip_address: req.ip || req.connection.remoteAddress,
      details: { incidentId, diagnosis }
    });

    return res.status(201).json({ message: 'Prescription filed successfully', prescription });
  } catch (err) {
    console.error('[PRESCRIPTION API] Failed to create prescription:', err.message);
    return res.status(500).json({ error: 'Failed to record prescription details' });
  }
});

/**
 * @route GET /api/prescriptions/:incidentId
 * @desc Get prescriptions linked to a specific emergency incident
 */
router.get('/:incidentId', verifyToken(), async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: { incident_id: req.params.incidentId },
      order: [['createdAt', 'DESC']]
    });
    return res.json(prescriptions);
  } catch (err) {
    console.error('[PRESCRIPTION API] Failed to fetch prescriptions by incident:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve prescriptions' });
  }
});

/**
 * @route GET /api/prescriptions/patient/:patientId
 * @desc Retrieve all historical prescriptions for a specific patient
 */
router.get('/patient/:patientId', verifyToken(), async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: { patient_id: req.params.patientId },
      order: [['createdAt', 'DESC']]
    });
    return res.json(prescriptions);
  } catch (err) {
    console.error('[PRESCRIPTION API] Failed to fetch prescriptions by patient:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve patient prescription logs' });
  }
});

module.exports = router;
