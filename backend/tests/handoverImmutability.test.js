const { syncDatabase, sequelize, ClinicalHandover } = require('../utils/db');

describe('Clinical Handover Immutability Test', () => {
  beforeAll(async () => {
    await syncDatabase();
    if (sequelize.getDialect() === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;').catch(() => {});
    }
  });

  afterAll(async () => {
    // Keep connection alive for other test suites running sequentially
  });

  test('should allow transition from SUBMITTED to ACKNOWLEDGED', async () => {
    const handover = await ClinicalHandover.create({
      incident_id: '11111111-1111-1111-1111-111111111111',
      chief_complaint: 'Severe chest pain radiating to left arm',
      news2_score: 7,
      status: 'SUBMITTED'
    });

    expect(handover.status).toBe('SUBMITTED');

    handover.status = 'ACKNOWLEDGED';
    handover.receiving_clinician_name = 'Dr. Patel (Senior ER Physician)';
    handover.acknowledged_at = new Date();
    await handover.save();

    expect(handover.status).toBe('ACKNOWLEDGED');
    expect(handover.receiving_clinician_name).toBe('Dr. Patel (Senior ER Physician)');
  });

  test('should reject further edits on ACKNOWLEDGED clinical handover', async () => {
    const handover = await ClinicalHandover.create({
      incident_id: '22222222-2222-2222-2222-222222222222',
      chief_complaint: 'Acute respiratory distress',
      news2_score: 8,
      status: 'ACKNOWLEDGED',
      receiving_clinician_name: 'Dr. Mehta'
    });

    handover.chief_complaint = 'Altered chief complaint attempt';
    await expect(handover.save()).rejects.toThrow('Completed clinical handovers are immutable');
  });
});
