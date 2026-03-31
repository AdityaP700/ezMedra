const assert = require('node:assert/strict');
const policyEngine = require('../modules/policy/policy.engine');

(function testRuleHolidayMatch() {
  const d = new Date('2026-06-20T00:00:00Z'); // 3rd Saturday
  assert.equal(policyEngine.matchesHolidayRule(d, '3rd Saturday'), true);
})();

(function testWorkingDayExclusion() {
  const d = new Date('2026-01-26T00:00:00Z');
  const holidays = [{ type: 'PUBLIC', date: '2026-01-26', is_recurring: true }];
  assert.equal(policyEngine.isWorkingDay(d, holidays), false);
})();

(function testOverlapDeduction() {
  const full = policyEngine.calculateSlotOverlapDeduction({
    slotStart: 600,
    slotEnd: 660,
    leaveStart: 590,
    leaveEnd: 700,
  });
  const partial = policyEngine.calculateSlotOverlapDeduction({
    slotStart: 600,
    slotEnd: 660,
    leaveStart: 620,
    leaveEnd: 640,
  });
  const none = policyEngine.calculateSlotOverlapDeduction({
    slotStart: 600,
    slotEnd: 660,
    leaveStart: 601,
    leaveEnd: 610,
  });

  assert.equal(full, 1);
  assert.equal(partial, 0.5);
  assert.equal(none, 0);
})();

console.log('policy-engine tests passed');
