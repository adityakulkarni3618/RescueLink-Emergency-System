const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { GoogleGenAI } = require('@google/generative-ai');
const { AuditLog } = require('../utils/db');

// Initialize Gemini API if key is present
const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
let aiModel = null;
if (geminiKey) {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    aiModel = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('[AI COPILOT] Gemini AI initialized successfully.');
  } catch (err) {
    console.error('[AI COPILOT ERROR] Failed to initialize Gemini GenAI:', err.message);
  }
} else {
  console.log('[AI COPILOT] No GEMINI_API_KEY specified. Using rule-based clinical fallback.');
}

/**
 * Helper: Rule-based fallback triage generator when API keys are not present.
 */
function getRuleBasedTriage(symptoms) {
  const text = symptoms.toLowerCase();
  
  if (text.includes('chest pain') || text.includes('heart attack') || text.includes('cardiac') || text.includes('unconscious') || text.includes('breathing') || text.includes('choking')) {
    return {
      severity: 'CRITICAL',
      triageColor: 'RED',
      detectedCondition: 'Potential Acute Coronary Syndrome or Respiratory Arrest',
      urgentMessage: 'Immediate life-support response is critical. Do not delay.',
      suggestedAmbulanceType: 'ALS',
      suggestedHospitalType: 'Cardiac Center',
      estimatedTimeToDeterioration: '5 - 10 minutes',
      immediateActions: [
        'Check responsiveness and breathing immediately.',
        'If chest pain: Place patient in a comfortable sitting position.',
        'Administer aspirin (325mg) if patient is conscious and not allergic.',
        'Be ready to perform CPR and use an AED if breathing stops.'
      ]
    };
  }

  if (text.includes('accident') || text.includes('bleeding') || text.includes('fracture') || text.includes('fall') || text.includes('injury')) {
    return {
      severity: 'HIGH',
      triageColor: 'RED',
      detectedCondition: 'Severe Physical Trauma / Active Hemorrhage',
      urgentMessage: 'High risk of hemorrhagic shock. Immediate stabilization required.',
      suggestedAmbulanceType: 'ALS',
      suggestedHospitalType: 'Trauma Center',
      estimatedTimeToDeterioration: '15 - 30 minutes',
      immediateActions: [
        'Apply direct pressure to the wound with a clean cloth to control bleeding.',
        'Keep the patient warm and lying flat to prevent shock.',
        'Do not move the patient if neck or spinal injury is suspected.',
        'Elevate the injured limb above heart level if no fracture is suspected.'
      ]
    };
  }

  if (text.includes('stroke') || text.includes('face drooping') || text.includes('weakness') || text.includes('speech')) {
    return {
      severity: 'CRITICAL',
      triageColor: 'RED',
      detectedCondition: 'Acute Cerebrovascular Incident (Stroke)',
      urgentMessage: 'Time-critical brain ischemia. Golden hour window active.',
      suggestedAmbulanceType: 'ALS',
      suggestedHospitalType: 'Stroke/Neurology Center',
      estimatedTimeToDeterioration: '30 - 60 minutes',
      immediateActions: [
        'Note the exact time symptoms first started.',
        'Keep the patient lying on their side to prevent choking if they vomit.',
        'Do not give the patient anything to eat or drink.',
        'Ensure the patient is kept calm and breathing freely.'
      ]
    };
  }

  if (text.includes('burn') || text.includes('scald') || text.includes('fire')) {
    return {
      severity: 'MEDIUM',
      triageColor: 'YELLOW',
      detectedCondition: 'Thermal Burn Injury',
      urgentMessage: 'Risk of infection and fluid loss. Proper dressing required.',
      suggestedAmbulanceType: 'BLS',
      suggestedHospitalType: 'Burns Specialist Unit',
      estimatedTimeToDeterioration: '2 - 4 hours',
      immediateActions: [
        'Cool the burn immediately with cool running water for 10-20 minutes.',
        'Remove any constricting jewelry or clothing near the burn, unless stuck.',
        'Cover the burn loosely with clean cling film or sterile non-adherent dressing.',
        'Do not apply ice, butter, or ointments to the burn.'
      ]
    };
  }

  // General default fallback
  return {
    severity: 'MEDIUM',
    triageColor: 'YELLOW',
    detectedCondition: 'Undifferentiated Emergency Presentation',
    urgentMessage: 'Requires clinical evaluation. Pre-hospital monitoring recommended.',
    suggestedAmbulanceType: 'BLS',
    suggestedHospitalType: 'General Hospital',
    estimatedTimeToDeterioration: '1 - 2 hours',
    immediateActions: [
      'Keep the patient resting and comfortable.',
      'Monitor vital signs (heart rate, breathing, skin temperature).',
      'Collect and prepare patient medical history or medications.',
      'Ensure clear airway and check for any sudden changes in state.'
    ]
  };
}

/**
 * @route POST /api/ai/copilot
 * @desc Get real-time symptom analysis and triage recommendations
 */
router.post('/copilot', verifyToken(), async (req, res) => {
  const { symptoms } = req.body;
  if (!symptoms || !symptoms.trim()) {
    return res.status(400).json({ error: 'Symptoms description is required' });
  }

  try {
    let triageResponse;

    if (aiModel) {
      const prompt = `You are a clinical triage AI assistant for RescueLink Emergency Services.
Analyze the following user-reported emergency description:
"${symptoms}"

Based on the clinical indications, determine:
1. Severity level: "CRITICAL" (immediate threat), "HIGH" (severe/unstable), "MEDIUM" (stable but urgent), or "LOW" (non-urgent).
2. Triage Color code: "RED" (Immediate/Resuscitation), "YELLOW" (Urgent/Delayed), or "GREEN" (Non-urgent).
3. Likely detected condition (short clinical summary).
4. Urgent message / warning.
5. Suggested ambulance type: "ALS" (Advanced Life Support - ventilators, medications needed) or "BLS" (Basic Life Support - minor trauma, fractures, stable patients).
6. Suggested hospital type: e.g. "Cardiac Center", "Trauma Center", "Stroke Center", "Burns Center", "General Hospital", "Pediatric Center".
7. Estimated time window before significant deterioration if untreated (e.g. "5 - 10 minutes", "1 - 2 hours", "N/A").
8. Immediate actions (list of 3-5 immediate steps the bystander or paramedic should perform).

Provide the output in STRIXT JSON format. Do not write any markdown blocks, explanations, or code fences around the JSON. The response must be a single parseable JSON object matching this structure exactly:
{
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "triageColor": "RED" | "YELLOW" | "GREEN",
  "detectedCondition": "short description",
  "urgentMessage": "short message",
  "suggestedAmbulanceType": "ALS" | "BLS",
  "suggestedHospitalType": "type of facility",
  "estimatedTimeToDeterioration": "estimated time",
  "immediateActions": ["step 1", "step 2", "step 3"]
}`;

      try {
        const result = await aiModel.generateContent(prompt);
        const textResponse = result.response.text().trim();
        // Remove code fences if LLM ignored instructions
        const cleaned = textResponse.replace(/^```json/, '').replace(/```$/, '').trim();
        triageResponse = JSON.parse(cleaned);
      } catch (geminiErr) {
        console.warn('[AI COPILOT] Gemini call failed, resorting to rule-based fallback:', geminiErr.message);
        triageResponse = getRuleBasedTriage(symptoms);
      }
    } else {
      triageResponse = getRuleBasedTriage(symptoms);
    }

    // Write to AuditLog
    await AuditLog.create({
      user_id: req.user.id,
      action: 'AI_TRIAGE',
      resource: 'AIModel',
      resource_id: 'gemini-1.5-flash',
      ip_address: req.ip || req.connection.remoteAddress,
      details: { symptoms: symptoms.slice(0, 100), severity: triageResponse.severity }
    });

    return res.json(triageResponse);
  } catch (err) {
    console.error('[AI COPILOT ROUTE] Error in triage copilot:', err.message);
    return res.status(500).json({ error: 'AI Triage processing failed' });
  }
});

module.exports = router;
