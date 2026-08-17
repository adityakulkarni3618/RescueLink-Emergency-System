const express = require('express');
const router = express.Router();
const { ChronicLog, Patient, VitalsHistory } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logAudit } = require('../utils/auditLogger');

// Initialize Gemini API if key is present
const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
let aiModel = null;
if (geminiKey) {
  try {
    const ai = new GoogleGenerativeAI(geminiKey);
    aiModel = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('[CHRONIC AI] Gemini AI initialized successfully.');
  } catch (err) {
    console.error('[CHRONIC AI ERROR] Failed to initialize Gemini GenAI:', err.message);
  }
}

/**
  * Helper: Rule-based fallback chronic risk prediction when Gemini API is not available
  */
function getRuleBasedChronicRisk(logs, patientName, conditions = []) {
  let riskScore = 0; // scale 0-10
  const alerts = [];
  const recommendations = [];

  // Check recent logs
  if (logs && logs.length > 0) {
    const latest = logs[0];
    
    // Blood Glucose check (mg/dL)
    if (latest.blood_glucose) {
      if (latest.blood_glucose > 200) {
        riskScore += 4;
        alerts.push('Hyperglycemia detected (High Blood Sugar)');
        recommendations.push('Review patient insulin dosage or oral hypoglycemic agents immediately.');
      } else if (latest.blood_glucose < 70) {
        riskScore += 4;
        alerts.push('Hypoglycemia detected (Critical Low Blood Sugar)');
        recommendations.push('Administer fast-acting glucose/carbohydrates immediately.');
      }
    }

    // BP check
    if (latest.systolic_bp && latest.diastolic_bp) {
      if (latest.systolic_bp > 160 || latest.diastolic_bp > 100) {
        riskScore += 4;
        alerts.push('Stage 2 Hypertension detected');
        recommendations.push('Schedule urgent cardiac/BP monitoring; adjust antihypertensive regimen.');
      } else if (latest.systolic_bp > 140 || latest.diastolic_bp > 90) {
        riskScore += 2;
        alerts.push('Stage 1 Hypertension detected');
        recommendations.push('Advise dietary modifications (low sodium) and lifestyle adjustments.');
      }
    }

    // Inhaler usage
    if (latest.asthma_inhaler_usage && latest.asthma_inhaler_usage > 3) {
      riskScore += 3;
      alerts.push('Excessive asthma rescue inhaler use (>3 times/day)');
      recommendations.push('Consider starting or scaling up controller therapies (e.g., inhaled corticosteroids).');
    }
  }

  // Cap risk score
  riskScore = Math.min(riskScore, 10);
  let status = 'STABLE';
  if (riskScore >= 7) status = 'CRITICAL';
  else if (riskScore >= 4) status = 'MODERATE';

  return {
    patientName,
    conditions,
    riskScore,
    status,
    alerts: alerts.length > 0 ? alerts : ['No acute chronic alerts detected'],
    recommendations: recommendations.length > 0 ? recommendations : ['Continue regular monitoring and lifestyle maintenance.'],
    model: 'Rule-Based Fallback Engine'
  };
}

/**
 * @route POST /api/chronic/logs
 * @desc Log patient chronic metrics
 */
router.post('/logs', verifyToken(), async (req, res) => {
  const { patient_id, blood_glucose, systolic_bp, diastolic_bp, medication_adherence, symptoms, asthma_inhaler_usage } = req.body;
  if (!patient_id) {
    return res.status(400).json({ error: 'Patient ID is required' });
  }

  try {
    const patient = await Patient.findByPk(patient_id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const log = await ChronicLog.create({
      patient_id,
      blood_glucose: blood_glucose ? parseFloat(blood_glucose) : null,
      systolic_bp: systolic_bp ? parseInt(systolic_bp) : null,
      diastolic_bp: diastolic_bp ? parseInt(diastolic_bp) : null,
      medication_adherence: medication_adherence !== undefined ? medication_adherence : true,
      symptoms: symptoms || '',
      asthma_inhaler_usage: asthma_inhaler_usage ? parseInt(asthma_inhaler_usage) : 0
    });

    return res.status(201).json({ message: 'Chronic log recorded successfully', log });
  } catch (err) {
    console.error('[CHRONIC ROUTE ERROR] Failed to create log:', err.message);
    return res.status(500).json({ error: 'Failed to record chronic metrics' });
  }
});

/**
 * @route GET /api/chronic/logs/:patientId
 * @desc Get chronic logs for a patient
 */
router.get('/logs/:patientId', verifyToken(), async (req, res) => {
  const { patientId } = req.params;

  try {
    const logs = await ChronicLog.findAll({
      where: { patient_id: patientId },
      order: [['timestamp', 'DESC']],
      limit: 50
    });

    return res.json(logs);
  } catch (err) {
    console.error('[CHRONIC ROUTE ERROR] Failed to fetch logs:', err.message);
    return res.status(500).json({ error: 'Failed to fetch chronic logs' });
  }
});

/**
 * @route POST /api/chronic/predict-risk/:patientId
 * @desc Get AI-powered risk prediction & recommendations based on historical metrics
 */
router.post('/predict-risk/:patientId', verifyToken(), async (req, res) => {
  const { patientId } = req.params;

  try {
    const patient = await Patient.findByPk(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const logs = await ChronicLog.findAll({
      where: { patient_id: patientId },
      order: [['timestamp', 'DESC']],
      limit: 10
    });

    const conditions = patient.conditions || [];
    const patientName = patient.name_masked || patient.name || 'Anonymous Patient';

    if (aiModel) {
      const prompt = `You are a clinical AI specialist for RescueLink Proactive Health Systems.
Analyze the following patient clinical context and recent chronic log history:
Patient Profile:
- Name: ${patientName}
- Existing Chronic Conditions: ${JSON.stringify(conditions)}

Recent Chronic Logs (newest first):
${JSON.stringify(logs, null, 2)}

Based on the clinical indications, determine:
1. Risk score: on a scale of 0 (perfectly healthy/stable) to 10 (critical emergency deterioration imminent).
2. Status level: "STABLE", "MODERATE", or "CRITICAL".
3. Specific Alerts (list of potential complications or acute risks detected from logs, e.g., Stage 2 Hypertension, Hypoglycemia).
4. Proactive Recommendations (actionable steps for doctors to manage/prevent complications).

Provide the output in STRICT JSON format. Do not write any markdown blocks, explanations, or code fences around the JSON. The response must be a single parseable JSON object matching this structure exactly:
{
  "patientName": "string",
  "conditions": ["string"],
  "riskScore": number,
  "status": "STABLE" | "MODERATE" | "CRITICAL",
  "alerts": ["alert 1", "alert 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

      try {
        const result = await aiModel.generateContent(prompt);
        const textResponse = result.response.text().trim();
        const cleaned = textResponse.replace(/^```json/, '').replace(/```$/, '').trim();
        const responseJson = JSON.parse(cleaned);
        responseJson.model = 'Gemini Proactive AI Engine';
        return res.json(responseJson);
      } catch (geminiErr) {
        console.warn('[CHRONIC AI] Gemini analysis failed. Falling back to rule-based analysis:', geminiErr.message);
        const fallback = getRuleBasedChronicRisk(logs, patientName, conditions);
        return res.json(fallback);
      }
    } else {
      const result = getRuleBasedChronicRisk(logs, patientName, conditions);
      return res.json(result);
    }
  } catch (err) {
    console.error('[CHRONIC AI ROUTE] Error in prediction:', err.message);
    return res.status(500).json({ error: 'AI Prediction processing failed' });
  }
});

module.exports = router;
