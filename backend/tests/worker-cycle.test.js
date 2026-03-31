const assert = require('node:assert/strict');

const { runMaintenanceCycle } = require('../workers/system.worker');
const commonRepository = require('../modules/common/common.repository');
const adminRepository = require('../modules/admin/admin.repository');

(async function run() {
  const originalProcessQueue = commonRepository.processNotificationQueue;
  const originalRebuild = adminRepository.rebuildHolidayInstances;
  const originalCleanup = adminRepository.cleanupExpiredDelegations;

  let processed = false;
  let rebuilt = false;
  let cleaned = false;

  commonRepository.processNotificationQueue = async () => {
    processed = true;
    return { processed: 1 };
  };
  adminRepository.rebuildHolidayInstances = async () => {
    rebuilt = true;
    return { generated: 1 };
  };
  adminRepository.cleanupExpiredDelegations = async () => {
    cleaned = true;
    return { cleaned: 1 };
  };

  try {
    await runMaintenanceCycle();
    assert.equal(processed, true);
    assert.equal(rebuilt, true);
    assert.equal(cleaned, true);
    console.log('worker-cycle test passed');
  } finally {
    commonRepository.processNotificationQueue = originalProcessQueue;
    adminRepository.rebuildHolidayInstances = originalRebuild;
    adminRepository.cleanupExpiredDelegations = originalCleanup;
  }
})();
