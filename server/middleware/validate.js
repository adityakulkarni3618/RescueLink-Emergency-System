const Joi = require('joi');

/**
 * Middleware to validate request body against a Joi schema.
 * @param {Joi.ObjectSchema} schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false, allowUnknown: true });
    if (error) {
      console.log(`[VALIDATION ERROR] Request body failed validation: ${error.message}`);
      const errors = error.details.map(detail => detail.message);
      
      if (errors.some(msg => msg.includes('"incidentId"') && msg.includes('required'))) {
        return res.status(400).json({ error: 'Incident ID is required', details: errors });
      }
      
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    next();
  };
};

const loginBody = Joi.object({
  email: Joi.string().email().optional(),
  id: Joi.string().optional(),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
}).xor('email', 'id');

const verifyMfaBody = Joi.object({
  mfaToken: Joi.string().required(),
  totpCode: Joi.string().min(6).max(8).required()
});

const verifyAddressBody = Joi.object({
  abhaAddress: Joi.string().required()
});

const aadhaarOtpBody = Joi.object({
  aadhaar: Joi.string().length(12).pattern(/^\d+$/).required().messages({
    'string.pattern.base': 'Aadhaar must be exactly 12 numeric digits'
  })
});

const consentRequestBody = Joi.object({
  abhaAddress: Joi.string().required(),
  purpose: Joi.string().optional()
});

const abdmVerifyBody = Joi.object({
  transactionId: Joi.string().required(),
  otp: Joi.string().required(),
  abhaAddress: Joi.string().required()
});

const hospitalCapacityBody = Joi.object({
  availableICUBeds: Joi.number().integer().min(0).optional(),
  availableVentilators: Joi.number().integer().min(0).optional(),
  bloodBankStatus: Joi.any().optional()
});

const syncBatchBody = Joi.object({
  incidentId: Joi.string().required(),
  gpsQueue: Joi.array().items(Joi.object()).optional(),
  vitalsQueue: Joi.array().items(Joi.object()).optional()
});

const hisAdmitBody = Joi.object({
  incidentId: Joi.string().required()
});

const hisOrderDrugBody = Joi.object({
  patientId: Joi.string().required(),
  drugName: Joi.string().required()
});

const hisDischargeBody = Joi.object({
  summary: Joi.string().required()
});

const requestConsultBody = Joi.object({
  incidentId: Joi.string().required(),
  speciality: Joi.string().required()
});

module.exports = {
  validate,
  loginBody,
  verifyMfaBody,
  verifyAddressBody,
  aadhaarOtpBody,
  consentRequestBody,
  abdmVerifyBody,
  hospitalCapacityBody,
  syncBatchBody,
  hisAdmitBody,
  hisOrderDrugBody,
  hisDischargeBody,
  requestConsultBody
};
