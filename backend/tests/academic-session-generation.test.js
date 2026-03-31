const assert = require('node:assert/strict');

const academicService = require('../modules/academic/academic.service');
const academicRepository = require('../modules/academic/academic.repository');
const leaveRepository = require('../modules/leave/leave.repository');

(async function run() {
  const originalGetSlots = academicRepository.getClassSlots;
  const originalUpsert = academicRepository.upsertClassSession;
  const originalHolidayInstances = leaveRepository.getHolidayInstancesInRange;

  const writes = [];

  academicRepository.getClassSlots = async () => [
    { id: 1, day_of_week: 1 },
    { id: 2, day_of_week: 2 },
  ];
  academicRepository.upsertClassSession = async (payload) => {
    writes.push(payload);
    return payload;
  };
  leaveRepository.getHolidayInstancesInRange = async () => [{ date: '2026-03-31' }];

  try {
    const result = await academicService.generateSessions({ fromDate: '2026-03-30', toDate: '2026-03-31' });
    assert.equal(result.generated, 2);

    const mondaySession = writes.find((w) => w.date === '2026-03-30');
    const tuesdaySession = writes.find((w) => w.date === '2026-03-31');

    assert.equal(mondaySession.status, 'CONDUCTED');
    assert.equal(tuesdaySession.status, 'CANCELLED');
    assert.equal(tuesdaySession.cancellationSource, 'HOLIDAY');
    console.log('academic-session-generation test passed');
  } finally {
    academicRepository.getClassSlots = originalGetSlots;
    academicRepository.upsertClassSession = originalUpsert;
    leaveRepository.getHolidayInstancesInRange = originalHolidayInstances;
  }
})();
