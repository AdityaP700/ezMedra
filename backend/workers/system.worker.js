const commonRepository = require('../modules/common/common.repository');
const adminRepository = require('../modules/admin/admin.repository');

let timer = null;

async function runMaintenanceCycle() {
  try {
    const year = new Date().getUTCFullYear();
    await Promise.all([
      commonRepository.processNotificationQueue(100),
      adminRepository.rebuildHolidayInstances(`${year}-01-01`, `${year + 1}-12-31`),
      adminRepository.cleanupExpiredDelegations(),
    ]);
  } catch (error) {
    console.error('Worker cycle failed:', error.message);
  }
}

function startSystemWorker() {
  if (timer) {
    return;
  }

  const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 60000);
  timer = setInterval(runMaintenanceCycle, intervalMs);
  runMaintenanceCycle();
  console.log(`Worker started (interval ${intervalMs}ms)`);
}

function stopSystemWorker() {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startSystemWorker,
  stopSystemWorker,
  runMaintenanceCycle,
};
