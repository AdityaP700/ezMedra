const assert = require('node:assert/strict');

const adminService = require('../modules/admin/admin.service');
const adminRepository = require('../modules/admin/admin.repository');
const commonRepository = require('../modules/common/common.repository');

(async function run() {
  const originalGetIdempotency = commonRepository.getIdempotency;
  const originalSaveIdempotency = commonRepository.saveIdempotency;
  const originalLogAudit = commonRepository.logAudit;
  const originalApprove = adminRepository.approveLeave;
  const originalIncDelegation = adminRepository.incrementDelegationUsage;

  const cache = new Map();
  let approveCalls = 0;

  commonRepository.getIdempotency = async (_actorId, key, action) => cache.get(`${action}:${key}`) || null;
  commonRepository.saveIdempotency = async (_actorId, key, action, payload) => {
    cache.set(`${action}:${key}`, payload);
  };
  commonRepository.logAudit = async () => {};

  adminRepository.approveLeave = async () => {
    approveCalls += 1;
    return { data: { id: 101, student_id: 3, approved_days: 1, override_flag: false } };
  };
  adminRepository.incrementDelegationUsage = async () => {};

  try {
    const user = { adminType: 'SUPER_ADMIN', departmentId: null, isDelegated: false };
    await adminService.approveLeave(101, 1, 'ok', 1, user, 'idem-1');
    await adminService.approveLeave(101, 1, 'ok', 1, user, 'idem-1');

    assert.equal(approveCalls, 1, 'idempotent call should execute repository only once');
    console.log('admin-idempotency test passed');
  } finally {
    commonRepository.getIdempotency = originalGetIdempotency;
    commonRepository.saveIdempotency = originalSaveIdempotency;
    commonRepository.logAudit = originalLogAudit;
    adminRepository.approveLeave = originalApprove;
    adminRepository.incrementDelegationUsage = originalIncDelegation;
  }
})();
