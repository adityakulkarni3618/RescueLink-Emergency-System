const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const dotenv = require('dotenv');
dotenv.config();

let portInstance = null;
let simulatedInterval = null;

/**
 * Parses an HL7 v2 ORU^R01 message string to extract patient vital signs.
 */
function parseHL7ORU(hl7String) {
  const segments = hl7String.split(/[\r\n]+/);
  const vitals = {};
  
  for (const segment of segments) {
    const fields = segment.split('|');
    const segmentId = fields[0];
    
    if (segmentId === 'OBX') {
      const observationId = fields[3]; // e.g. "8867-4^Heart rate^LN"
      const observationValue = fields[5];
      
      if (observationId && observationValue !== undefined) {
        const obsName = (observationId.split('^')[1] || '').toLowerCase();
        const val = parseFloat(observationValue);
        
        if (obsName.includes('heart rate') || obsName.includes('hr')) {
          vitals.heartRate = Math.round(val);
        } else if (obsName.includes('oxygen saturation') || obsName.includes('spo2')) {
          vitals.spo2 = val;
        } else if (obsName.includes('systolic blood pressure') || obsName.includes('bp systolic') || obsName.includes('systolic')) {
          vitals.systolic = Math.round(val);
        } else if (obsName.includes('diastolic blood pressure') || obsName.includes('bp diastolic') || obsName.includes('diastolic')) {
          vitals.diastolic = Math.round(val);
        } else if (obsName.includes('body temperature') || obsName.includes('temp')) {
          vitals.temperature = val;
        } else if (obsName.includes('respiratory rate') || obsName.includes('resp rate') || obsName.includes('rr')) {
          vitals.respRate = Math.round(val);
        } else if (obsName.includes('blood glucose') || obsName.includes('glucose')) {
          vitals.bloodGlucose = Math.round(val);
        }
      }
    }
  }
  return vitals;
}

/**
 * Generates simulated HL7 ORU^R01 message.
 */
function generateMockHL7(prevVitals = {}) {
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const jitter = (v, range) => v + (Math.random() - 0.5) * range;

  const hr = Math.round(clamp(jitter(prevVitals.heartRate || 75, 4), 50, 150));
  const spo2 = Math.round(clamp(jitter(prevVitals.spo2 || 98, 0.5), 85, 100) * 10) / 10;
  const sys = Math.round(clamp(jitter(prevVitals.systolic || 120, 4), 90, 180));
  const dia = Math.round(clamp(jitter(prevVitals.diastolic || 80, 2), 60, 100));
  const temp = Math.round(clamp(jitter(prevVitals.temperature || 37.0, 0.1), 36.0, 39.5) * 10) / 10;
  const rr = Math.round(clamp(jitter(prevVitals.respRate || 16, 1), 12, 28));
  const glucose = Math.round(clamp(jitter(prevVitals.bloodGlucose || 100, 3), 70, 200));

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

  return [
    `MSH|^~\\&|VitalsMonitor|Hospital|RescueLink|System|${timestamp}||ORU^R01|MSG${Date.now()}|P|2.5`,
    `PID|1||PAT-001^^^MRN||Patient^Test^||19800101|M`,
    `OBR|1|||||||20260615120000`,
    `OBX|1|NM|8867-4^Heart rate^LN||${hr}|bpm|||||F`,
    `OBX|2|NM|2708-6^Oxygen saturation^LN||${spo2}|%|||||F`,
    `OBX|3|NM|8480-6^Systolic blood pressure^LN||${sys}|mmHg|||||F`,
    `OBX|4|NM|8462-4^Diastolic blood pressure^LN||${dia}|mmHg|||||F`,
    `OBX|5|NM|8310-5^Body temperature^LN||${temp}|C|||||F`,
    `OBX|6|NM|9279-1^Respiratory rate^LN||${rr}|/min|||||F`,
    `OBX|7|NM|15074-8^Blood glucose^LN||${glucose}|mg/dL|||||F`
  ].join('\r');
}

/**
 * Initializes the connection to the serial port and sets up parsing/broadcasting.
 */
function initVitalsBridge(io, activeRequests) {
  const serialPath = process.env.SERIAL_PORT_PATH;
  
  if (serialPath) {
    console.log(`[VITALS BRIDGE] Attempting to connect to serial port: ${serialPath}`);
    try {
      portInstance = new SerialPort({
        path: serialPath,
        baudRate: 9600,
        autoOpen: true
      });
      
      const parser = portInstance.pipe(new ReadlineParser({ delimiter: '\r' }));
      let messageBuffer = [];
      
      parser.on('data', (data) => {
        const line = data.trim();
        if (line.startsWith('MSH')) {
          if (messageBuffer.length > 0) {
            processHL7Message(messageBuffer.join('\r'), io, activeRequests);
          }
          messageBuffer = [line];
        } else if (messageBuffer.length > 0) {
          messageBuffer.push(line);
        }
      });
      
      portInstance.on('open', () => {
        console.log(`[VITALS BRIDGE] Serial Port ${serialPath} opened successfully.`);
      });
      
      portInstance.on('error', (err) => {
        console.error(`[VITALS BRIDGE] Serial port error: ${err.message}. Falling back to simulation.`);
        startSimulation(io, activeRequests);
      });
      
    } catch (err) {
      console.error(`[VITALS BRIDGE] Failed to initialize Serial Port: ${err.message}. Falling back to simulation.`);
      startSimulation(io, activeRequests);
    }
  } else {
    console.log('[VITALS BRIDGE] No SERIAL_PORT_PATH specified in .env. Booting in SIMULATION mode.');
    startSimulation(io, activeRequests);
  }
}

function processHL7Message(hl7Msg, io, activeRequests) {
  try {
    const vitals = parseHL7ORU(hl7Msg);
    const unitId = process.env.AMBULANCE_UNIT_ID || 'AMB-101';
    const activeMission = Object.values(activeRequests).find(
      r => (r.unitId === unitId || r.ambulanceSocket) && r.status !== 'completed'
    );
    
    const payload = {
      ...vitals,
      source: 'LIVE',
      timestamp: Date.now(),
      reqId: activeMission ? activeMission.id : null
    };
    
    if (activeMission) {
      io.to(`mission_${activeMission.id}`).emit('vitals-update', payload);
      if (!activeMission.vitalsHistory) activeMission.vitalsHistory = [];
      activeMission.vitalsHistory.push(payload);
    } else {
      io.emit('vitals-update', payload);
    }
  } catch (err) {
    console.error('[VITALS BRIDGE] Error processing HL7 message:', err.message);
  }
}

function startSimulation(io, activeRequests) {
  if (simulatedInterval) clearInterval(simulatedInterval);
  
  let currentVitals = {
    heartRate: 75,
    spo2: 98,
    systolic: 120,
    diastolic: 80,
    temperature: 37.0,
    respRate: 16,
    bloodGlucose: 100
  };
  
  simulatedInterval = setInterval(() => {
    const hl7Msg = generateMockHL7(currentVitals);
    currentVitals = parseHL7ORU(hl7Msg);
    
    const activeMission = Object.values(activeRequests).find(r => r.status !== 'completed');
    
    const payload = {
      ...currentVitals,
      source: 'SIMULATED',
      timestamp: Date.now(),
      reqId: activeMission ? activeMission.id : null
    };
    
    if (activeMission) {
      if (!activeMission.vitalsHistory) activeMission.vitalsHistory = [];
      activeMission.vitalsHistory.push(payload);
      io.to(`mission_${activeMission.id}`).emit('vitals-update', payload);
    } else {
      io.emit('vitals-update', payload);
    }
  }, 3000);
}

module.exports = {
  initVitalsBridge,
  parseHL7ORU,
  generateMockHL7
};
