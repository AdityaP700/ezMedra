const reportsRepository = require('./reports.repository');

class ReportsService {
  async getLeaveReport(filters) {
    return reportsRepository.getLeaveReport(filters);
  }

  async getAggregateStats(filters) {
    return reportsRepository.getAggregateStats(filters);
  }
}

module.exports = new ReportsService();
