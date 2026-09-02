const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { verifyToken } = require('../middleware/auth');
const { Patient, AuditLog } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');

/**
 * @route POST /api/passport/generate
 * @desc Generate signed Emergency QR Health Passport Data URL
 */
router.post('/generate', verifyToken(), async (req, res) => {
  const { patientId } = req.body;
  const targetId = patientId || req.user.id;

  try {
    const patient = await Patient.findByPk(targetId);
    
    // Construct emergency payload
    const emergencyPayload = {
      type: 'RESCUELINK_EMERGENCY_ID',
      version: '1.0',
      abha: patient?.abha_number || 'ABDM-91-8899-2233',
      name: patient?.name || req.user.name || 'Emergency Patient',
      blood: patient?.blood_group || 'O+',
      allergies: patient?.allergies || ['NKA'],
      conditions: patient?.chronic_conditions || ['None'],
      emergencyContact: `${patient?.emergency_contact_name || 'Emergency Contact'} (${patient?.emergency_contact_mobile || req.user.mobile || '911'})`,
      issuedAt: new Date().toISOString()
    };

    const payloadString = JSON.stringify(emergencyPayload);
    
    // Generate base64 Data URL for scannable QR Code
    const qrDataUrl = await QRCode.toDataURL(payloadString, {
      errorCorrectionLevel: 'H',
      margin: 2,
      color: {
        dark: '#00c8ff',
        light: '#050d1a'
      }
    });

    await logAudit(
      'HEALTH_PASSPORT',
      'GENERATE_EMERGENCY_QR',
      { patientId: targetId, blood: emergencyPayload.blood },
      'INFO',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({
      message: 'Emergency QR Passport Generated Successfully',
      passport: emergencyPayload,
      qrDataUrl
    });
  } catch (err) {
    console.error('[QR PASSPORT ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to generate emergency QR passport' });
  }
});

module.exports = router;
