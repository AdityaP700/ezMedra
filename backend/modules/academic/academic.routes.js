const express = require('express');
const { body, param } = require('express-validator');
const {
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
} = require('./academic.controller');
const { verifyToken, authorizeRoles, authorizePermission } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate');

const router = express.Router();

router.use(verifyToken);

router.get('/sections', getSections);
router.post(
  '/sections',
  authorizeRoles('admin'),
  [
    body('name').trim().isLength({ min: 2, max: 20 }),
    body('branch').trim().isLength({ min: 2, max: 20 }),
    body('semester').isInt({ min: 1, max: 10 }),
    body('departmentId').isInt({ min: 1 }),
  ],
  validateRequest,
  createSection
);

router.post(
  '/assignments/subjects',
  authorizeRoles('admin'),
  [
    body('subjectId').isInt({ min: 1 }),
    body('facultyId').isInt({ min: 1 }),
    body('sectionId').isInt({ min: 1 }),
  ],
  validateRequest,
  assignSubject
);

router.post(
  '/teaching-roles',
  authorizeRoles('admin'),
  [
    body('userId').isInt({ min: 1 }),
    body('subjectId').isInt({ min: 1 }),
    body('role').isIn(['PRIMARY', 'ASSISTANT']),
    body('permissions').optional().isObject(),
  ],
  validateRequest,
  upsertTeachingRole
);

router.get('/subjects', getSubjects);
router.post(
  '/subjects',
  authorizeRoles('admin'),
  [
    body('code').trim().isLength({ min: 2, max: 20 }),
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('type').optional().isIn(['THEORY', 'LAB']),
    body('credits').optional().isFloat({ gt: 0, lt: 10 }),
    body('departmentId').isInt({ min: 1 }),
    body('semester').isInt({ min: 1, max: 10 }),
  ],
  validateRequest,
  createSubject
);

router.get('/slots', getClassSlots);
router.get(
  '/assignments/me',
  authorizeRoles('faculty', 'phd_scholar', 'ta'),
  authorizePermission('markAttendance'),
  getMyTeachingAssignments
);
router.post(
  '/slots',
  authorizeRoles('admin'),
  [
    body('subjectId').isInt({ min: 1 }),
    body('facultyId').isInt({ min: 1 }),
    body('sectionId').optional().isInt({ min: 1 }),
    body('dayOfWeek').isInt({ min: 0, max: 6 }),
    body('startTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('endTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('isLab').optional().isBoolean(),
  ],
  validateRequest,
  createClassSlot
);
router.put('/slots/:id', authorizeRoles('admin'), [param('id').isInt({ min: 1 })], validateRequest, updateClassSlot);
router.delete('/slots/:id', authorizeRoles('admin'), [param('id').isInt({ min: 1 })], validateRequest, deleteClassSlot);

router.post(
  '/sessions',
  authorizeRoles('faculty', 'phd_scholar', 'ta'),
  authorizePermission('markAttendance'),
  [
    body('classSlotId').optional().isInt({ min: 1 }),
    body('subjectId').optional().isInt({ min: 1 }),
    body('sectionId').optional().isInt({ min: 1 }),
    body('date').isISO8601(),
    body('startTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('endTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('type').optional().isIn(['REGULAR', 'EXTRA']),
    body('weight').optional().isFloat({ gt: 0, lte: 2 }),
    body('status').isIn(['CONDUCTED', 'CANCELLED']),
  ],
  validateRequest,
  markClassSession
);

router.post(
  '/sessions/:classSessionId/attendance',
  authorizeRoles('faculty', 'phd_scholar', 'ta'),
  authorizePermission('markAttendance'),
  [
    param('classSessionId').isInt({ min: 1 }),
    body('marks').isArray({ min: 1 }),
    body('marks.*').custom((mark) => {
      const hasStudentId = mark && mark.studentId !== undefined && mark.studentId !== null && String(mark.studentId).trim() !== '';
      const hasIdentifier = mark && mark.studentIdentifier !== undefined && mark.studentIdentifier !== null && String(mark.studentIdentifier).trim() !== '';
      if (!hasStudentId && !hasIdentifier) {
        throw new Error('Each mark must include studentId or studentIdentifier.');
      }
      return true;
    }),
    body('marks.*.studentId').optional().isInt({ min: 1 }),
    body('marks.*.studentIdentifier').optional().isString().isLength({ min: 2, max: 120 }),
    body('marks.*.status').isIn(['PRESENT', 'ABSENT']),
    body('reason').optional().isString().isLength({ min: 3, max: 255 }),
  ],
  validateRequest,
  markAttendance
);

router.patch(
  '/sessions/:classSessionId/lifecycle',
  authorizeRoles('faculty', 'phd_scholar', 'ta', 'admin'),
  [
    param('classSessionId').isInt({ min: 1 }),
    body('lifecycleStatus').isIn(['OPEN', 'LOCKED', 'FINALIZED']),
    body('reason').optional().isString().isLength({ min: 3, max: 255 }),
  ],
  validateRequest,
  updateSessionLifecycle
);

router.get(
  '/faculty/sessions/recent',
  authorizeRoles('faculty', 'phd_scholar', 'ta'),
  authorizePermission('markAttendance'),
  getFacultyRecentSessions
);

router.get(
  '/sessions/:classSessionId/students',
  authorizeRoles('faculty', 'phd_scholar', 'ta'),
  authorizePermission('markAttendance'),
  [param('classSessionId').isInt({ min: 1 })],
  validateRequest,
  getSessionStudentsForAttendance
);

router.get(
  '/sessions/:classSessionId/attendance/history',
  authorizeRoles('faculty', 'phd_scholar', 'ta', 'admin'),
  [param('classSessionId').isInt({ min: 1 })],
  validateRequest,
  getAttendanceHistory
);

router.post(
  '/sessions/generate',
  authorizeRoles('admin'),
  [
    body('fromDate').isISO8601(),
    body('toDate').isISO8601(),
  ],
  validateRequest,
  generateSessions
);

router.get('/attendance/me', authorizeRoles('student'), getMyAttendance);
router.get('/attendance/predict', authorizeRoles('student'), predictMyAttendance);
router.get('/attendance/insights/me', authorizeRoles('student'), getStudentInsights);
router.get('/faculty/insights/me', authorizeRoles('faculty', 'phd_scholar', 'ta'), getFacultyInsights);

module.exports = router;
