const academicService = require('./academic.service');
const { asyncHandler } = require('../../middleware/errorHandler');
const { normalizeDateUTC } = require('../../utils/dateTime');

const getSections = asyncHandler(async (req, res) => {
  const data = await academicService.getSections(req.query.departmentId, req.query.semester);
  res.json({ success: true, data });
});

const createSection = asyncHandler(async (req, res) => {
  const data = await academicService.createSection(req.body);
  res.status(201).json({ success: true, data });
});

const assignSubject = asyncHandler(async (req, res) => {
  const data = await academicService.assignSubject(req.body);
  res.status(201).json({ success: true, data });
});

const upsertTeachingRole = asyncHandler(async (req, res) => {
  const data = await academicService.upsertTeachingRole(req.body);
  res.status(201).json({ success: true, data });
});

const getSubjects = asyncHandler(async (req, res) => {
  const data = await academicService.getSubjects(req.query.departmentId, req.query.semester);
  res.json({ success: true, data });
});

const createSubject = asyncHandler(async (req, res) => {
  const data = await academicService.createSubject(req.body);
  res.status(201).json({ success: true, data });
});

const getClassSlots = asyncHandler(async (req, res) => {
  const data = await academicService.getClassSlots(req.query);
  res.json({ success: true, data });
});

const getMyTeachingAssignments = asyncHandler(async (req, res) => {
  const data = await academicService.getFacultyTeachingAssignments(req.user.userId);
  res.json({ success: true, data });
});

const createClassSlot = asyncHandler(async (req, res) => {
  const data = await academicService.createClassSlot(req.body);
  res.status(201).json({ success: true, data });
});

const updateClassSlot = asyncHandler(async (req, res) => {
  const data = await academicService.updateClassSlot(req.params.id, req.body);
  res.json({ success: true, data });
});

const deleteClassSlot = asyncHandler(async (req, res) => {
  const data = await academicService.deleteClassSlot(req.params.id);
  res.json({ success: true, data });
});

const markClassSession = asyncHandler(async (req, res) => {
  const data = await academicService.markClassSession(req.user.userId, {
    classSlotId: req.body.classSlotId ? Number(req.body.classSlotId) : null,
    subjectId: req.body.subjectId ? Number(req.body.subjectId) : null,
    sectionId: req.body.sectionId ? Number(req.body.sectionId) : null,
    date: normalizeDateUTC(req.body.date),
    startTime: req.body.startTime || null,
    endTime: req.body.endTime || null,
    type: req.body.type || 'REGULAR',
    weight: req.body.weight ? Number(req.body.weight) : 1,
    status: req.body.status,
  });
  res.json({ success: true, data });
});

const markAttendance = asyncHandler(async (req, res) => {
  const marks = (req.body.marks || []).map((mark) => ({
    studentId: mark.studentId ? Number(mark.studentId) : null,
    studentIdentifier: mark.studentIdentifier ? String(mark.studentIdentifier).trim() : null,
    status: mark.status,
  }));
  const data = await academicService.markAttendance(
    req.user.userId,
    Number(req.params.classSessionId),
    marks,
    req.body.reason ? String(req.body.reason).trim() : null
  );
  res.json({ success: true, data });
});

const updateSessionLifecycle = asyncHandler(async (req, res) => {
  const data = await academicService.updateSessionLifecycle(
    req.user,
    Number(req.params.classSessionId),
    req.body.lifecycleStatus,
    req.body.reason ? String(req.body.reason).trim() : null
  );
  res.json({ success: true, data });
});

const getFacultyRecentSessions = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  const data = await academicService.getFacultyRecentSessions(req.user.userId, limit);
  res.json({ success: true, data });
});

const getSessionStudentsForAttendance = asyncHandler(async (req, res) => {
  const data = await academicService.getSessionStudentsForAttendance(req.user.userId, Number(req.params.classSessionId));
  res.json({ success: true, data });
});

const getAttendanceHistory = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  const data = await academicService.getAttendanceHistory(req.user, Number(req.params.classSessionId), limit);
  res.json({ success: true, data });
});

const getMyAttendance = asyncHandler(async (req, res) => {
  const data = await academicService.getAttendanceSummary(req.user.userId, req.query.subjectId ? Number(req.query.subjectId) : null);
  res.json({ success: true, data });
});

const predictMyAttendance = asyncHandler(async (req, res) => {
  const data = await academicService.predictAttendance(req.user.userId, req.query.subjectId ? Number(req.query.subjectId) : null);
  res.json({ success: true, data });
});

const getStudentInsights = asyncHandler(async (req, res) => {
  const data = await academicService.getStudentInsights(req.user.userId);
  res.json({ success: true, data });
});

const getFacultyInsights = asyncHandler(async (req, res) => {
  const data = await academicService.getFacultyInsights(req.user.userId);
  res.json({ success: true, data });
});

const generateSessions = asyncHandler(async (req, res) => {
  const data = await academicService.generateSessions({
    fromDate: normalizeDateUTC(req.body.fromDate),
    toDate: normalizeDateUTC(req.body.toDate),
  });
  res.json({ success: true, data });
});

module.exports = {
  getSections,
  createSection,
  assignSubject,
  upsertTeachingRole,
  getSubjects,
  createSubject,
  getClassSlots,
  getMyTeachingAssignments,
  createClassSlot,
  updateClassSlot,
  deleteClassSlot,
  markClassSession,
  markAttendance,
  updateSessionLifecycle,
  getFacultyRecentSessions,
  getSessionStudentsForAttendance,
  getAttendanceHistory,
  getMyAttendance,
  predictMyAttendance,
  getStudentInsights,
  getFacultyInsights,
  generateSessions,
};
