const express = require('express');
const router = express.Router();
const HISBridge = require('../utils/hisBridge');
const { Incident } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');

/**
 * @route POST /api/his/admit
 * @desc Admit patient in hospital HIS
 */
router.post('/admit', verifyToken(['doctor', 'hospital_admin']), async (req, res) => {
  const { incidentId } = req.body;
  if (!incidentId) return res.status(400).json({ error: 'Incident ID is required' });

  try {
    const whereClause = { id: incidentId };
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const incident = await Incident.findOne({ where: whereClause });
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const hisBridge = new HISBridge(req.user.hospital_id || incident.hospital_id);
    const admission = await hisBridge.admitPatient(incident);

    return res.json(admission);
  } catch (err) {
    console.error('[HIS ROUTE ERROR] admitPatient failed:', err.message);
    return res.status(500).json({ error: 'HIS admission request failed' });
  }
});

/**
 * @route GET /api/his/patient/:abhaNumber
 * @desc Get patient history from HIS by ABHA number
 */
router.get('/patient/:abhaNumber', verifyToken(['doctor', 'hospital_admin']), async (req, res) => {
  const { abhaNumber } = req.params;
  try {
    const hisBridge = new HISBridge(req.user.hospital_id);
    const record = await hisBridge.getPatientRecord(abhaNumber);
    return res.json(record);
  } catch (err) {
    console.error('[HIS ROUTE ERROR] getPatientRecord failed:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve patient HIS records' });
  }
});

/**
 * @route POST /api/his/order/drug
 * @desc Submit pharmacy order to HIS
 */
router.post('/order/drug', verifyToken(['doctor', 'hospital_admin']), async (req, res) => {
  const { patientId, drugName } = req.body;
  if (!patientId || !drugName) {
    return res.status(400).json({ error: 'Patient ID and drug name are required' });
  }

  try {
    const hisBridge = new HISBridge(req.user.hospital_id);
    const order = await hisBridge.orderDrugScreen(patientId, drugName);
    return res.json(order);
  } catch (err) {
    console.error('[HIS ROUTE ERROR] orderDrugScreen failed:', err.message);
    return res.status(500).json({ error: 'Failed to submit pharmacy order' });
  }
});

/**
 * @route POST /api/his/discharge/:incidentId
 * @desc Upload discharge summary to HIS
 */
router.post('/discharge/:incidentId', verifyToken(['doctor', 'hospital_admin']), async (req, res) => {
  const { incidentId } = req.params;
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: 'Discharge summary text is required' });

  try {
    const hisBridge = new HISBridge(req.user.hospital_id);
    const upload = await hisBridge.uploadDischargeSummary(incidentId, summary);
    return res.json(upload);
  } catch (err) {
    console.error('[HIS ROUTE ERROR] uploadDischargeSummary failed:', err.message);
    return res.status(500).json({ error: 'Failed to upload discharge summary' });
  }
});

module.exports = router;
