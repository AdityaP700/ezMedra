const adminService = require('./admin.service');
const { asyncHandler } = require('../../middleware/errorHandler');
const { normalizeDateUTC } = require('../../utils/dateTime');

const getForwardedLeaves = asyncHandler(async (req, res) => {
  const leaves = await adminService.getForwardedLeaves(req.user);
  res.json({ success: true, data: leaves });
});

const approveLeave = asyncHandler(async (req, res) => {
  const { remarks, approvedDays, overrideHighRisk } = req.body;
  const leave = await adminService.approveLeave(
    req.params.id,
    req.user.userId,
    remarks,
    approvedDays,
    req.user,
    req.headers['idempotency-key'],
    { overrideHighRisk: !!overrideHighRisk }
  );

  res.json({
    success: true,
    message: 'Leave approved as per attendance policy.',
    data: leave,
  });
});

const approveLeavesBulk = asyncHandler(async (req, res) => {
  const { leaveIds, remarks } = req.body;
  const result = await adminService.approveLeavesBulk(
    leaveIds,
    req.user.userId,
    remarks,
    req.user,
    req.headers['idempotency-key']
  );

  res.json({
    success: true,
    message: 'Bulk approve completed.',
    data: result,
  });
});

const rejectLeave = asyncHandler(async (req, res) => {
  const { remarks } = req.body;
  const leave = await adminService.rejectLeave(
    req.params.id,
    req.user.userId,
    remarks,
    req.user,
    req.headers['idempotency-key']
  );

  res.json({
    success: true,
    message: 'Leave application rejected.',
    data: leave,
  });
});

const rejectLeavesBulk = asyncHandler(async (req, res) => {
  const { leaveIds, remarks } = req.body;
  const result = await adminService.rejectLeavesBulk(
    leaveIds,
    req.user.userId,
    remarks,
    req.user,
    req.headers['idempotency-key']
  );

  res.json({
    success: true,
    message: 'Bulk reject completed.',
    data: result,
  });
});

const verifyDocument = asyncHandler(async (req, res) => {
  const doc = await adminService.verifyDocument(req.params.id, req.user.userId);
  res.json({ success: true, message: 'Document verified.', data: doc });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await adminService.getAllUsers(req.user);
  res.json({ success: true, data: users });
});

const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await adminService.toggleUserStatus(req.params.id);
  res.json({
    success: true,
    message: `User ${user.is_active ? 'activated' : 'deactivated'}.`,
    data: user,
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await adminService.deleteUser(req.params.id);
  res.json({ success: true, message: 'User deleted.', data: user });
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await adminService.getStats(req.user);
  res.json({ success: true, data: stats });
});

const getHolidays = asyncHandler(async (req, res) => {
  const holidays = await adminService.getHolidays();
  res.json({ success: true, data: holidays });
});

const addHoliday = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    date: req.body.date ? normalizeDateUTC(req.body.date) : null,
  };
  const holiday = await adminService.addHoliday(payload);
  res.status(201).json({ success: true, message: 'Holiday added.', data: holiday });
});

const updateHoliday = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    date: req.body.date ? normalizeDateUTC(req.body.date) : null,
  };
  const holiday = await adminService.updateHoliday(req.params.id, payload);
  res.json({ success: true, message: 'Holiday updated.', data: holiday });
});

const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await adminService.deleteHoliday(req.params.id);
  res.json({ success: true, message: 'Holiday removed.', data: holiday });
});

const getDelegations = asyncHandler(async (req, res) => {
  const delegations = await adminService.getDelegations();
  res.json({ success: true, data: delegations });
});

const createDelegation = asyncHandler(async (req, res) => {
  const delegation = await adminService.createDelegation(req.body, req.user.userId);
  res.status(201).json({ success: true, data: delegation });
});

const deactivateDelegation = asyncHandler(async (req, res) => {
  const delegation = await adminService.deactivateDelegation(req.params.id, req.user.userId);
  res.json({ success: true, data: delegation });
});

const reassignLeave = asyncHandler(async (req, res) => {
  const { newFacultyId, reason } = req.body;
  const leave = await adminService.reassignLeave(req.params.id, Number(newFacultyId), reason, req.user.userId);
  res.json({ success: true, message: 'Leave reassigned.', data: leave });
});

const recalculateOnHolidayChange = asyncHandler(async (req, res) => {
  const data = await adminService.recalculateLeavesOnHolidayChange();
  res.json({ success: true, data });
});

const resetAcademicYear = asyncHandler(async (req, res) => {
  const result = await adminService.resetAcademicYear(req.user.userId);
  res.json({ success: true, data: result });
});

const getAuditLogs = asyncHandler(async (req, res) => {
  const logs = await adminService.getAuditLogs(req.query.limit);
  res.json({ success: true, data: logs });
});

module.exports = {
  getForwardedLeaves,
  approveLeave,
  approveLeavesBulk,
  rejectLeave,
  rejectLeavesBulk,
  verifyDocument,
  getAllUsers,
  toggleUserStatus,
  deleteUser,
  getStats,
  getHolidays,
  addHoliday,
  updateHoliday,
  deleteHoliday,
  getDelegations,
  createDelegation,
  deactivateDelegation,
  reassignLeave,
  recalculateOnHolidayChange,
  resetAcademicYear,
  getAuditLogs,
};
