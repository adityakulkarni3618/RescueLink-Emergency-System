/**
 * VitalsProvider Architecture
 *
 * Provider abstraction for streaming patient telemetry and vital signs.
 * Implementations:
 *  - RealDeviceProvider (Serial port / Web Bluetooth HL7 ORU^R01 feed)
 *  - SimulatorVitalsProvider (Clinically plausible deterministic vital signs stream)
 */

const { parseHL7ORU, generateMockHL7 } = require('./vitalsBridge');

class VitalsProvider {
  constructor(mode = 'SIMULATED') {
    this.mode = mode;
  }

  formatVitalsPayload(vitalsData, source = 'SIMULATED') {
    const now = Date.now();
    const isStale = (now - (vitalsData.timestamp || now)) > 15000;

    let status = 'SIMULATED';
    if (source === 'DEVICE' || source === 'MANUAL') {
      status = 'LIVE';
    } else if (isStale) {
      status = 'STALE';
    }

    return {
      heartRate: vitalsData.heartRate || null,
      spo2: vitalsData.spo2 || null,
      systolic: vitalsData.systolic || null,
      diastolic: vitalsData.diastolic || null,
      temperature: vitalsData.temperature || null,
      respRate: vitalsData.respRate || null,
      bloodGlucose: vitalsData.bloodGlucose || null,
      timestamp: vitalsData.timestamp || now,
      deviceId: vitalsData.deviceId || (source === 'DEVICE' ? 'MONITOR-SERIAL-01' : 'SIMULATOR-01'),
      source: source,
      status: isStale ? 'STALE' : status
    };
  }
}

class RealDeviceProvider extends VitalsProvider {
  constructor() {
    super('REAL');
  }

  processRawHL7(hl7String) {
    if (!hl7String || typeof hl7String !== 'string') {
      return {
        heartRate: null,
        spo2: null,
        timestamp: Date.now(),
        source: 'DEVICE',
        status: 'UNAVAILABLE',
        reason: 'Invalid or missing HL7 payload'
      };
    }

    const vitals = parseHL7ORU(hl7String);
    return this.formatVitalsPayload({ ...vitals, timestamp: Date.now() }, 'DEVICE');
  }
}

class SimulatorVitalsProvider extends VitalsProvider {
  constructor() {
    super('SIMULATED');
    this.lastVitals = {
      heartRate: 78,
      spo2: 97,
      systolic: 122,
      diastolic: 82,
      temperature: 37.0,
      respRate: 16,
      bloodGlucose: 105
    };
  }

  generateNextReading() {
    const rawHL7 = generateMockHL7(this.lastVitals);
    this.lastVitals = parseHL7ORU(rawHL7);
    return this.formatVitalsPayload({ ...this.lastVitals, timestamp: Date.now() }, 'SIMULATED');
  }
}

module.exports = {
  VitalsProvider,
  RealDeviceProvider,
  SimulatorVitalsProvider
};
