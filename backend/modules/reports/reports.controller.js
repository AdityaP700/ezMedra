const reportsService = require('./reports.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const getLeaveReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, status, studentId, departmentId, page, limit } = req.query;

  const result = await reportsService.getLeaveReport({
    startDate,
    endDate,
    status,
    studentId,
    departmentId,
    page: page || 1,
    limit: limit || 50,
  });

  res.json({ success: true, ...result });
});

const getAggregateStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, departmentId } = req.query;

  const stats = await reportsService.getAggregateStats({ startDate, endDate, departmentId });

  res.json({ success: true, data: stats });
});

module.exports = { getLeaveReport, getAggregateStats };
