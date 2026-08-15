const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { fetchNdmaAlerts, exportToNdmaCasualtyReport } = require('../utils/ndmaIntegration');
const { forwardIncidentTo108 } = require('../utils/controlRoomBridge');

/**
 * @route GET /api/disaster/ndma-alerts
 * @desc Retrieve active warnings from NDMA feed
 * @access Private
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
 * @access Private
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

module.exports = router;
