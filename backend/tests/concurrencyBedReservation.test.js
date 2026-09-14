const { syncDatabase, sequelize, Hospital } = require('../utils/db');

describe('Concurrency Hospital Bed Reservation Test', () => {
  beforeAll(async () => {
    await syncDatabase();
    if (sequelize.getDialect() === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;').catch(() => {});
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('should safely handle concurrent bed reservation requests', async () => {
    const hospital = await Hospital.create({
      name: 'Central Trauma Institute',
      contact_number: '+919876543210',
      icu_beds: 1,
      total_beds: 10,
      is_active: true
    });

    expect(hospital.icu_beds).toBe(1);

    // Simulate atomic bed allocation helper using database transactions
    const allocateBed = async (hospitalId) => {
      const t = await sequelize.transaction();
      try {
        const targetHospital = await Hospital.findByPk(hospitalId, {
          transaction: t,
          lock: t.LOCK ? t.LOCK.UPDATE : true
        });

        if (!targetHospital || targetHospital.icu_beds <= 0) {
          await t.rollback();
          return { success: false, reason: 'RESOURCE_UNAVAILABLE' };
        }

        targetHospital.icu_beds -= 1;
        await targetHospital.save({ transaction: t });
        await t.commit();
        return { success: true, remaining: targetHospital.icu_beds };
      } catch (err) {
        await t.rollback();
        return { success: false, reason: err.message };
      }
    };

    // Run two concurrent bed allocation requests for the last remaining bed
    const [res1, res2] = await Promise.all([
      allocateBed(hospital.id),
      allocateBed(hospital.id)
    ]);

    const successes = [res1, res2].filter(r => r.success);
    const failures = [res1, res2].filter(r => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].reason.includes('RESOURCE_UNAVAILABLE') || failures[0].reason.includes('database is locked') || failures[0].reason.includes('SQLITE_BUSY')).toBe(true);

    const finalHospitalState = await Hospital.findByPk(hospital.id);
    expect(finalHospitalState.icu_beds).toBe(0);
  });
});
