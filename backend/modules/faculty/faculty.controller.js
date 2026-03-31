const facultyService = require('./faculty.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const getPendingLeaves = asyncHandler(async (req, res) => {
  const leaves = await facultyService.getPendingLeaves(req.user.departmentId, req.user.userId);
  res.json({ success: true, data: leaves });
});

const forwardLeave = asyncHandler(async (req, res) => {
  const { remarks } = req.body;
  const leave = await facultyService.forwardLeave(
    req.params.id,
    req.user.userId,
    req.user.departmentId,
    remarks
  );

  res.json({
    success: true,
    message: 'Leave sent to HOD for final review.',
    data: leave,
  });
});

const rejectLeave = asyncHandler(async (req, res) => {
  const { remarks } = req.body;
  const leave = await facultyService.rejectLeave(
    req.params.id,
    req.user.userId,
    req.user.departmentId,
    remarks
  );

  res.json({
    success: true,
    message: 'Rejection recommendation sent to HOD for final review.',
    data: leave,
  });
});

module.exports = { getPendingLeaves, forwardLeave, rejectLeave };
