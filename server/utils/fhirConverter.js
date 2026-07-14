// server/utils/fhirConverter.js
// Enterprise HL7 FHIR v4.0.1 Integration Engine aligned with India's ABDM NRCES Profiles

function generateFHIRBundle(patientId, patientName, vitals, fieldNotes) {
    const timestamp = new Date().toISOString();
    
    // Generate a secure, simulated UUID for the FHIR Document
    const bundleId = `fhir-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return {
        resourceType: "Bundle",
        id: bundleId,
        meta: {
            profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"]
        },
        type: "document",
        timestamp: timestamp,
        entry: [
            {
                fullUrl: `urn:uuid:patient-${patientId}`,
                resource: {
                    resourceType: "Patient",
                    id: patientId,
                    meta: {
                        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"]
                    },
                    active: true,
                    name: [{
                        use: "official",
                        text: patientName
                    }]
                }
            },
            {
                fullUrl: `urn:uuid:obs-hr-${Date.now()}`,
                resource: {
                    resourceType: "Observation",
                    id: `obs-hr-${Date.now()}`,
                    meta: {
                        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"]
                    },
                    status: "final",
                    category: [{
                        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }]
                    }],
                    code: {
                        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }]
                    },
                    subject: { reference: `urn:uuid:patient-${patientId}` },
                    effectiveDateTime: timestamp,
                    valueQuantity: {
                        value: vitals?.heartRate || 0,
                        unit: "beats/minute",
                        system: "http://unitsofmeasure.org",
                        code: "/min"
                    }
                }
            },
            {
                fullUrl: `urn:uuid:obs-spo2-${Date.now()}`,
                resource: {
                    resourceType: "Observation",
                    id: `obs-spo2-${Date.now()}`,
                    meta: {
                        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"]
                    },
                    status: "final",
                    category: [{
                        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }]
                    }],
                    code: {
                        coding: [{ system: "http://loinc.org", code: "2708-6", display: "Oxygen saturation in Arterial blood" }]
                    },
                    subject: { reference: `urn:uuid:patient-${patientId}` },
                    effectiveDateTime: timestamp,
                    valueQuantity: {
                        value: vitals?.spo2 || 0,
                        unit: "%",
                        system: "http://unitsofmeasure.org",
                        code: "%"
                    }
                }
            },
            {
                fullUrl: `urn:uuid:obs-bp-${Date.now()}`,
                resource: {
                    resourceType: "Observation",
                    id: `obs-bp-${Date.now()}`,
                    meta: {
                        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"]
                    },
                    status: "final",
                    category: [{
                        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }]
                    }],
                    code: {
                        coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood pressure panel with all children optional" }]
                    },
                    subject: { reference: `urn:uuid:patient-${patientId}` },
                    effectiveDateTime: timestamp,
                    component: [
                        {
                            code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic blood pressure" }] },
                            valueQuantity: { value: vitals?.systolic || 0, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" }
                        },
                        {
                            code: { coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }] },
                            valueQuantity: { value: vitals?.diastolic || 0, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" }
                        }
                    ]
                }
            },
            {
                fullUrl: `urn:uuid:obs-temp-${Date.now()}`,
                resource: {
                    resourceType: "Observation",
                    id: `obs-temp-${Date.now()}`,
                    meta: {
                        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"]
                    },
                    status: "final",
                    category: [{
                        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }]
                    }],
                    code: {
                        coding: [{ system: "http://loinc.org", code: "8310-5", display: "Body temperature" }]
                    },
                    subject: { reference: `urn:uuid:patient-${patientId}` },
                    effectiveDateTime: timestamp,
                    valueQuantity: {
                        value: vitals?.temperature || 37.0,
                        unit: "C",
                        system: "http://unitsofmeasure.org",
                        code: "Cel"
                    }
                }
            },
            {
                fullUrl: `urn:uuid:clinical-note-${Date.now()}`,
                resource: {
                    resourceType: "ClinicalImpression",
                    id: `clinical-note-${Date.now()}`,
                    meta: {
                        profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/ClinicalImpression"]
                    },
                    status: "completed",
                    subject: { reference: `urn:uuid:patient-${patientId}` },
                    effectiveDateTime: timestamp,
                    summary: fieldNotes || "No clinical notes provided."
                }
            }
        ]
    };
}

module.exports = { generateFHIRBundle };
