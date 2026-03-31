const express = require('express');
const { body } = require('express-validator');
const { getLeaveTypes, getMyLeaves, getLeaveBalance, getInsights, predictImpact, applyLeave, cancelLeave } = require('./leave.controller');
const { verifyToken, authorizeRoles } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate');
const { upload } = require('../../middleware/upload');

const router = express.Router();

// ── Validation Rules ──────────────────────────────
const applyValidation = [
  body('leaveTypeId').isInt({ min: 1 }).withMessage('Valid leave type is required.'),
  body('startDate').isISO8601().withMessage('Valid start date is required.'),
  body('endDate').isISO8601().withMessage('Valid end date is required.'),
  body('startTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('startTime must be HH:mm or HH:mm:ss.'),
  body('endTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('endTime must be HH:mm or HH:mm:ss.'),
  body('reason').trim().isLength({ min: 10 }).withMessage('Reason must be at least 10 characters.'),
  body('lateReason').optional().trim().isLength({ min: 5 }).withMessage('Late reason must be at least 5 characters.'),
  body('previousApplicationId').optional().isInt({ min: 1 }).withMessage('Previous application id must be valid.'),
  body('submitAnyway').optional().isBoolean().withMessage('submitAnyway must be boolean.'),
  body('overrideReason').optional().trim().isLength({ min: 10 }).withMessage('overrideReason must be at least 10 characters.'),
];

const predictValidation = [
  body('startDate').isISO8601().withMessage('Valid start date is required.'),
  body('endDate').isISO8601().withMessage('Valid end date is required.'),
  body('startTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('startTime must be HH:mm or HH:mm:ss.'),
  body('endTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('endTime must be HH:mm or HH:mm:ss.'),
  body('leaveTypeId').optional().isInt({ min: 1 }).withMessage('Valid leave type is required.'),
];

// ── Routes ────────────────────────────────────────
router.get('/types', verifyToken, getLeaveTypes);
router.get('/my', verifyToken, authorizeRoles('student'), getMyLeaves);
router.get('/balance', verifyToken, authorizeRoles('student'), getLeaveBalance);
router.get('/insights', verifyToken, authorizeRoles('student'), getInsights);
router.post('/predict', verifyToken, authorizeRoles('student'), predictValidation, validateRequest, predictImpact);
router.post('/', verifyToken, authorizeRoles('student'), upload.single('document'), applyValidation, validateRequest, applyLeave);
router.patch('/:id/cancel', verifyToken, authorizeRoles('student'), cancelLeave);

module.exports = router;
