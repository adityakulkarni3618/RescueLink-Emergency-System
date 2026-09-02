const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { fetchNdmaAlerts } = require('../utils/ndmaIntegration');
const { forwardIncidentTo108 } = require('../utils/controlRoomBridge');
const { MciTriageTag } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');

/**
 * @route GET /api/disaster/ndma-alerts
 * @desc Retrieve active warnings from NDMA feed
 */
router.get('/ndma-alerts', verifyToken(), async (req, res) => {
  try {
    const alerts = await fetchNdmaAlerts();
    return res.json(alerts);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve disaster warnings' });
  }
});

/**
 * @route POST /api/disaster/forward-108
 * @desc Forward incident telemetry to state 108 desk
 */
router.post('/forward-108', verifyToken(), async (req, res) => {
  const { incident } = req.body;
  if (!incident || !incident.id) {
    return res.status(400).json({ error: 'Incident data required' });
  }
  try {
    const receipt = await forwardIncidentTo108(incident);
    return res.json(receipt);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to relay data to 108 command desk' });
  }
});

/**
 * @route POST /api/disaster/triage-tag
 * @desc Issue a new digital triage wristband tag (START / JumpSTART Protocol)
 */
router.post('/triage-tag', verifyToken(), async (req, res) => {
  const { incident_id, tag_number, start_triage_color, patient_age_group, victim_name_or_alias, vitals_snapshot, injury_notes, assigned_transport_unit } = req.body;
  if (!incident_id || !start_triage_color) {
    return res.status(400).json({ error: 'Incident ID and triage color (RED, YELLOW, GREEN, BLACK) are required.' });
  }

  try {
    const tag = await MciTriageTag.create({
      incident_id,
      tag_number: tag_number || `TAG-${Date.now().toString().slice(-5)}`,
      nfc_uid: req.body.nfc_uid || `NFC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      start_triage_color: start_triage_color.toUpperCase(),
      patient_age_group: patient_age_group || 'ADULT',
      victim_name_or_alias: victim_name_or_alias || 'Unidentified Victim',
      vitals_snapshot: vitals_snapshot || {},
      injury_notes: injury_notes || '',
      assigned_transport_unit: assigned_transport_unit || null,
      status: 'ON_SCENE'
    });

    // Notify War Room via Socket.io if attached
    const io = req.app.get('socketio');
    if (io) {
      io.to('admin_warroom').emit('mci-triage-update', { incidentId: incident_id, tag });
    }

    await logAudit(
      'MCI_TRIAGE',
      'ISSUE_TRIAGE_TAG',
      { tagId: tag.id, color: tag.start_triage_color, incidentId: incident_id },
      'INFO',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({ message: 'Triage Tag Created', tag });
  } catch (err) {
    console.error('[MCI ROUTE ERROR] Tag creation failed:', err.message);
    return res.status(500).json({ error: 'Failed to issue triage tag' });
  }
});

/**
 * @route GET /api/disaster/triage-tags/:incidentId
 * @desc Get all triage tags and summary statistics for a disaster incident
 */
router.get('/triage-tags/:incidentId', verifyToken(), async (req, res) => {
  const { incidentId } = req.params;
  try {
    const tags = await MciTriageTag.findAll({
      where: { incident_id: incidentId },
      order: [['createdAt', 'DESC']]
    });

    const summary = {
      RED: tags.filter(t => t.start_triage_color === 'RED').length,
      YELLOW: tags.filter(t => t.start_triage_color === 'YELLOW').length,
      GREEN: tags.filter(t => t.start_triage_color === 'GREEN').length,
      BLACK: tags.filter(t => t.start_triage_color === 'BLACK').length,
      total: tags.length
    };

    return res.json({ summary, tags });
  } catch (err) {
    console.error('[MCI ROUTE ERROR] Tag retrieval failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch triage tags' });
  }
});

/**
 * @route PUT /api/disaster/triage-tag/:tagId
 * @desc Update color code, transport unit, or status of a triage tag
 */
router.put('/triage-tag/:tagId', verifyToken(), async (req, res) => {
  const { tagId } = req.params;
  const { start_triage_color, status, assigned_transport_unit, injury_notes } = req.body;
  try {
    const tag = await MciTriageTag.findByPk(tagId);
    if (!tag) {
      return res.status(404).json({ error: 'Triage tag record not found' });
    }

    await tag.update({
      start_triage_color: start_triage_color ? start_triage_color.toUpperCase() : tag.start_triage_color,
      status: status || tag.status,
      assigned_transport_unit: assigned_transport_unit !== undefined ? assigned_transport_unit : tag.assigned_transport_unit,
      injury_notes: injury_notes !== undefined ? injury_notes : tag.injury_notes
    });

    const io = req.app.get('socketio');
    if (io) {
      io.to('admin_warroom').emit('mci-triage-update', { incidentId: tag.incident_id, tag });
    }

    return res.json({ message: 'Triage tag updated', tag });
  } catch (err) {
    console.error('[MCI ROUTE ERROR] Tag update failed:', err.message);
    return res.status(500).json({ error: 'Failed to update triage tag' });
  }
});

module.exports = router;
