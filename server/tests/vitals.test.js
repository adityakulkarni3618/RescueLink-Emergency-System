const { parseHL7ORU, generateMockHL7 } = require('../utils/vitalsBridge');

describe('Vitals Bridge HL7 Engine', () => {
  describe('generateMockHL7', () => {
    it('should generate a valid HL7 v2 ORU^R01 message string', () => {
      const prevVitals = { heartRate: 75, spo2: 98, systolic: 120, diastolic: 80, temperature: 37.0 };
      const hl7Msg = generateMockHL7(prevVitals);

      expect(typeof hl7Msg).toBe('string');
      expect(hl7Msg).toContain('MSH|^~\\&|VitalsMonitor');
      expect(hl7Msg).toContain('PID|1||PAT-001');
      expect(hl7Msg).toContain('OBR|1|||||||');
      expect(hl7Msg).toContain('OBX|1|NM|8867-4^Heart rate^LN||');
    });
  });

  describe('parseHL7ORU', () => {
    it('should parse generated mock HL7 and extract correct vital sign metrics', () => {
      const prevVitals = { heartRate: 85, spo2: 97, systolic: 130, diastolic: 85, temperature: 38.2 };
      const hl7Msg = generateMockHL7(prevVitals);
      const parsed = parseHL7ORU(hl7Msg);

      expect(parsed).toHaveProperty('heartRate');
      expect(parsed).toHaveProperty('spo2');
      expect(parsed).toHaveProperty('systolic');
      expect(parsed).toHaveProperty('diastolic');
      expect(parsed).toHaveProperty('temperature');
      expect(parsed).toHaveProperty('respRate');

      expect(parsed.heartRate).toBeGreaterThanOrEqual(50);
      expect(parsed.heartRate).toBeLessThanOrEqual(150);
      expect(parsed.spo2).toBeGreaterThanOrEqual(85);
      expect(parsed.spo2).toBeLessThanOrEqual(100);
    });

    it('should parse an explicit raw HL7 string correctly', () => {
      const explicitHL7 = [
        'MSH|^~\\&|VitalsMonitor|Hospital|RescueLink|System|20260615120000||ORU^R01|MSG001|P|2.5',
        'PID|1||PAT-001^^^MRN||Patient^Test^||19800101|M',
        'OBR|1|||||||20260615120000',
        'OBX|1|NM|8867-4^Heart rate^LN||95|bpm|||||F',
        'OBX|2|NM|2708-6^Oxygen saturation^LN||96.5|%|||||F',
        'OBX|3|NM|8480-6^Systolic blood pressure^LN||125|mmHg|||||F',
        'OBX|4|NM|8462-4^Diastolic blood pressure^LN||82|mmHg|||||F',
        'OBX|5|NM|8310-5^Body temperature^LN||37.6|C|||||F'
      ].join('\r');

      const parsed = parseHL7ORU(explicitHL7);
      expect(parsed.heartRate).toBe(95);
      expect(parsed.spo2).toBe(96.5);
      expect(parsed.systolic).toBe(125);
      expect(parsed.diastolic).toBe(82);
      expect(parsed.temperature).toBe(37.6);
    });
  });
});
