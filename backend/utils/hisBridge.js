const axios = require('axios');
const { Hospital, Patient, Incident } = require('./db');

class HISBridge {
  constructor(hospitalId) {
    this.hospitalId = hospitalId;
    // We will dynamically fetch the HIS configuration JSON for the hospital
    this.config = null;
  }

  async loadConfig() {
    if (this.config) return;
    try {
      const hospital = await Hospital.findByPk(this.hospitalId);
      if (hospital && hospital.his_config) {
        this.config = typeof hospital.his_config === 'string' 
          ? JSON.parse(hospital.his_config) 
          : hospital.his_config;
      } else {
        // Fallback mock configuration
        this.config = {
          type: 'hl7v2',
          endpoint: 'https://his-gateway.local/hl7',
          credentials: { apiKey: 'mock-his-key-108' }
        };
      }
    } catch (err) {
      console.error('[HIS BRIDGE] Error loading HIS configuration:', err.message);
      this.config = { type: 'hl7v2', endpoint: 'https://his-gateway.local/hl7' };
    }
  }

  /**
   * Admits a patient when they arrive at the hospital ER.
   * Generates HL7 ADT^A04 (Admit) and creates FHIR Encounter payloads.
   */
  async admitPatient(incident) {
    await this.loadConfig();
    console.log(`[HIS BRIDGE] Initializing patient admission for Incident: ${incident.id}`);

    const patient = await Patient.findByPk(incident.patient_id);
    const patientName = patient ? patient.name : 'Unknown Patient';
    const abha = patient ? patient.abha_number : '91-0000-0000-0000';

    // 1. Generate HL7 v2.x ADT^A04 Message
    const msh = `MSH|^~\\&|RescueLink|System|HIS|Hospital|${new Date().toISOString().replace(/[-:T.Z]/g, '')}||ADT^A04|MSG-${Date.now()}|P|2.5`;
    const evn = `EVN|A04|${new Date().toISOString().replace(/[-:T.Z]/g, '')}`;
    const pid = `PID|1||${abha}^^^MRN||${patientName.replace(' ', '^')}||19900101|M`;
    const pv1 = `PV1|1|E|ER^BAY-3^BED-02|||||||||||||||||||||||||||||||||||`;
    const hl7Message = [msh, evn, pid, pv1].join('\r');

    // 2. Generate FHIR Encounter Resource
    const fhirEncounter = {
      resourceType: 'Encounter',
      id: `enc-${incident.id}`,
      status: 'in-progress',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'EMER',
        display: 'emergency'
      },
      subject: {
        reference: `Patient/pat-${incident.patient_id}`,
        display: patientName
      },
      period: {
        start: incident.started_at || new Date().toISOString()
      },
      hospitalization: {
        admitSource: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/admit-source', code: 'ems', display: 'Ambulance' }]
        }
      }
    };

    if (this.config.type === 'hl7v2') {
      console.log('[HIS BRIDGE] Transmitting HL7 v2 ADT^A04 packet:\n', hl7Message);
      // In production, POST hl7Message to this.config.endpoint
    } else if (this.config.type === 'fhir') {
      console.log('[HIS BRIDGE] Transmitting FHIR Encounter payload:\n', JSON.stringify(fhirEncounter, null, 2));
      // In production, POST fhirEncounter to FHIR Endpoint
    }

    // Mock response matching hospital ward assignments
    return {
      admissionId: `ADM-${Date.now().toString().slice(-6)}`,
      bedAssigned: 'ER-BAY-03',
      wardName: 'Emergency Trauma Ward',
      status: 'Admitted'
    };
  }

  /**
   * Fetches patient health records from the Hospital Information System (HIS).
   */
  async getPatientRecord(abhaNumber) {
    await this.loadConfig();
    console.log(`[HIS BRIDGE] Querying patient records for ABHA: ${abhaNumber}`);

    // Mock longitudinal health record from HIS database
    return {
      demographics: { abhaNumber, name: 'Jane Doe', dob: '1992-08-24', gender: 'F' },
      allergies: ['Penicillin', 'Peanuts'],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'Daily' },
        { name: 'Aspirin', dosage: '75mg', frequency: 'Daily' }
      ],
      diagnoses: [
        { code: 'I10', description: 'Essential Hypertension', date: '2025-02-12' },
        { code: 'E11', description: 'Type 2 Diabetes Mellitus', date: '2025-05-20' }
      ],
      previousVisits: [
        { date: '2025-11-15', hospital: 'Metro Cardiac Center', reason: 'Routine checkup' },
        { date: '2026-02-10', hospital: 'City Trauma Ward', reason: 'High blood pressure alert' }
      ]
    };
  }

  /**
   * Order medication / labs from HIS pharmacy and diagnostic systems.
   * Generates HL7 ORM^O01 (Order) Message.
   */
  async orderDrugScreen(patientId, drugName) {
    await this.loadConfig();
    console.log(`[HIS BRIDGE] Dispatching ORM^O01 pharmacy order for Patient: ${patientId}, Medication: ${drugName}`);

    const msh = `MSH|^~\\&|RescueLink|System|HIS|Pharmacy|${new Date().toISOString().replace(/[-:T.Z]/g, '')}||ORM^O01|MSG-${Date.now()}|P|2.5`;
    const orc = `ORC|NW|ORD-${Date.now()}|||||||${new Date().toISOString().replace(/[-:T.Z]/g, '')}`;
    const rxo = `RXO|${drugName}^LN|||||||||`;
    const hl7Order = [msh, orc, rxo].join('\r');

    console.log('[HIS BRIDGE] Generated HL7 v2 ORM^O01 packet:\n', hl7Order);

    return {
      orderId: `ORD-${Date.now().toString().slice(-6)}`,
      status: 'Ordered',
      medication: drugName,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Upload discharge summaries to the HIS FHIR server.
   */
  async uploadDischargeSummary(incidentId, summary) {
    await this.loadConfig();
    console.log(`[HIS BRIDGE] Compiling FHIR DocumentReference for Incident: ${incidentId}`);

    const fhirDocRef = {
      resourceType: 'DocumentReference',
      id: `doc-${incidentId}`,
      status: 'current',
      docStatus: 'final',
      type: {
        coding: [{ system: 'http://loinc.org', code: '11490-0', display: 'Discharge summary Note' }]
      },
      subject: { reference: `Patient/pat-associated` },
      content: [
        {
          attachment: {
            contentType: 'text/plain',
            data: Buffer.from(summary).toString('base64'),
            title: 'Emergency Encounter Discharge Summary'
          }
        }
      ]
    };

    console.log('[HIS BRIDGE] Transmitting DocumentReference to EHR:', JSON.stringify(fhirDocRef, null, 2));

    return {
      documentId: fhirDocRef.id,
      status: 'Uploaded',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = HISBridge;
