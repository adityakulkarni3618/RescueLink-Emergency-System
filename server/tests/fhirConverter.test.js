const { generateFHIRBundle } = require('../utils/fhirConverter');

describe('FHIR Converter Engine', () => {
  it('should generate a valid FHIR Document Bundle with correct attributes', () => {
    const patientId = 'PAT-99';
    const patientName = 'John Doe';
    const vitals = {
      heartRate: 88,
      spo2: 96,
      systolic: 128,
      diastolic: 84,
      temperature: 37.2
    };
    const fieldNotes = 'Patient alert and oriented, breathing stabilized with oxygen.';

    const bundle = generateFHIRBundle(patientId, patientName, vitals, fieldNotes);

    // Validate bundle header structure
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('document');
    expect(bundle).toHaveProperty('id');
    expect(bundle).toHaveProperty('timestamp');
    expect(Array.isArray(bundle.entry)).toBe(true);

    // Validate entries
    const entries = bundle.entry;
    
    // Patient resource
    const patientEntry = entries.find(e => e.resource.resourceType === 'Patient');
    expect(patientEntry).toBeDefined();
    expect(patientEntry.resource.id).toBe(patientId);
    expect(patientEntry.resource.name[0].text).toBe(patientName);

    // Heart rate observation resource
    const hrEntry = entries.find(e => e.resource.resourceType === 'Observation' && e.resource.code.coding[0].code === '8867-4');
    expect(hrEntry).toBeDefined();
    expect(hrEntry.resource.valueQuantity.value).toBe(88);

    // SpO2 observation resource
    const spo2Entry = entries.find(e => e.resource.resourceType === 'Observation' && e.resource.code.coding[0].code === '2708-6');
    expect(spo2Entry).toBeDefined();
    expect(spo2Entry.resource.valueQuantity.value).toBe(96);

    // BP observation resource (components)
    const bpEntry = entries.find(e => e.resource.resourceType === 'Observation' && e.resource.code.coding[0].code === '85354-9');
    expect(bpEntry).toBeDefined();
    const sysComponent = bpEntry.resource.component.find(c => c.code.coding[0].code === '8480-6');
    const diaComponent = bpEntry.resource.component.find(c => c.code.coding[0].code === '8462-4');
    expect(sysComponent.valueQuantity.value).toBe(128);
    expect(diaComponent.valueQuantity.value).toBe(84);

    // Clinical impression note
    const noteEntry = entries.find(e => e.resource.resourceType === 'ClinicalImpression');
    expect(noteEntry).toBeDefined();
    expect(noteEntry.resource.summary).toBe(fieldNotes);
  });
});
