const leaveService = require('./leave.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const getLeaveTypes = asyncHandler(async (req, res) => {
  const types = await leaveService.getLeaveTypes();
  res.json({ success: true, data: types });
});

const getMyLeaves = asyncHandler(async (req, res) => {
  const leaves = await leaveService.getStudentLeaves(req.user.userId);
  res.json({ success: true, data: leaves });
});

const getLeaveBalance = asyncHandler(async (req, res) => {
  const balance = await leaveService.getLeaveBalance(req.user.userId);
  res.json({ success: true, data: { balance } });
});

const getInsights = asyncHandler(async (req, res) => {
  const insights = await leaveService.getStudentInsights(req.user.userId);
  res.json({ success: true, data: insights });
});

const predictImpact = asyncHandler(async (req, res) => {
  const { leaveTypeId, startDate, endDate, startTime, endTime } = req.body;
  const prediction = await leaveService.predictLeaveImpact({
    studentId: req.user.userId,
    leaveTypeId: leaveTypeId ? Number(leaveTypeId) : null,
    startDate,
    endDate,
    startTime,
    endTime,
  });
  res.json({ success: true, data: prediction });
});

const applyLeave = asyncHandler(async (req, res) => {
  const {
    leaveTypeId,
    startDate,
    endDate,
    startTime,
    endTime,
    reason,
    lateReason,
    previousApplicationId,
    submitAnyway,
    overrideReason,
  } = req.body;

  const leave = await leaveService.applyLeave({
    studentId: req.user.userId,
    leaveTypeId: Number(leaveTypeId),
    startDate,
    endDate,
    startTime,
    endTime,
    reason,
    lateReason,
    previousApplicationId: previousApplicationId ? Number(previousApplicationId) : null,
    submitAnyway: submitAnyway === true || submitAnyway === 'true',
    overrideReason,
    file: req.file,
  });

  res.status(201).json({
    success: true,
    message: 'Leave application submitted successfully.',
    data: leave,
  });
});

const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await leaveService.cancelLeave(req.params.id, req.user.userId);

  res.json({
    success: true,
    message: 'Leave application cancelled.',
    data: leave,
  });
});

module.exports = { getLeaveTypes, getMyLeaves, getLeaveBalance, getInsights, predictImpact, applyLeave, cancelLeave };
