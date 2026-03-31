const express = require('express');
const { body, param } = require('express-validator');
const {
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
} = require('./admin.controller');
const { verifyToken, authorizeRoles, authorizePermission } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate');
const { resolveAdminDelegation } = require('../../middleware/adminDelegation.middleware');

const router = express.Router();

router.use(verifyToken, authorizeRoles('admin'), resolveAdminDelegation);

router.get('/stats', getStats);
router.get('/leaves', getForwardedLeaves);
router.patch(
	'/leaves/:id/approve',
	authorizePermission('approveLeave'),
	[
		body('approvedDays').optional().isFloat({ gt: 0 }).withMessage('approvedDays must be a positive number.'),
		body('overrideHighRisk').optional().isBoolean().withMessage('overrideHighRisk must be boolean.'),
	],
	validateRequest,
	approveLeave
);
router.patch(
	'/leaves/bulk/approve',
	authorizePermission('approveLeave'),
	[
		body('leaveIds').isArray({ min: 1 }).withMessage('leaveIds must be a non-empty array.'),
		body('leaveIds.*').isInt({ min: 1 }).withMessage('Each leave id must be valid.'),
		body('remarks').optional().trim().isLength({ min: 3 }).withMessage('Remarks must be at least 3 characters when provided.'),
	],
	validateRequest,
	approveLeavesBulk
);
router.patch('/leaves/:id/reject', rejectLeave);
router.patch(
	'/leaves/bulk/reject',
	[
		body('leaveIds').isArray({ min: 1 }).withMessage('leaveIds must be a non-empty array.'),
		body('leaveIds.*').isInt({ min: 1 }).withMessage('Each leave id must be valid.'),
		body('remarks').trim().isLength({ min: 5 }).withMessage('Remarks must be at least 5 characters.'),
	],
	validateRequest,
	rejectLeavesBulk
);
router.patch('/documents/:id/verify', [param('id').isInt({ min: 1 }).withMessage('Valid document id is required.')], validateRequest, verifyDocument);
router.patch(
	'/leaves/:id/reassign',
	[
		param('id').isInt({ min: 1 }).withMessage('Valid leave id is required.'),
		body('newFacultyId').isInt({ min: 1 }).withMessage('Valid faculty id is required.'),
		body('reason').trim().isLength({ min: 5 }).withMessage('Reason must be at least 5 characters.'),
	],
	validateRequest,
	reassignLeave
);
router.get('/holidays', getHolidays);
router.post(
	'/holidays',
	authorizePermission('manageHoliday'),
	[
		body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Holiday name is required.'),
		body('date').optional({ nullable: true }).isISO8601().withMessage('date must be a valid ISO date when provided.'),
		body('type').isIn(['PUBLIC', 'REGIONAL', 'WEEKEND_RULE']).withMessage('type must be PUBLIC, REGIONAL, or WEEKEND_RULE.'),
		body('isRecurring').optional().isBoolean().withMessage('isRecurring must be boolean.'),
		body('rule').optional({ nullable: true }).trim().isLength({ min: 3, max: 120 }).withMessage('rule must be 3-120 characters when provided.'),
		body('description').optional({ nullable: true }).trim().isLength({ min: 3, max: 255 }).withMessage('Description must be 3-255 characters when provided.'),
	],
	validateRequest,
	addHoliday
);
router.put(
	'/holidays/:id',
	authorizePermission('manageHoliday'),
	[
		param('id').isInt({ min: 1 }).withMessage('Valid holiday id is required.'),
		body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Holiday name is required.'),
		body('date').optional({ nullable: true }).isISO8601().withMessage('date must be a valid ISO date when provided.'),
		body('type').isIn(['PUBLIC', 'REGIONAL', 'WEEKEND_RULE']).withMessage('type must be PUBLIC, REGIONAL, or WEEKEND_RULE.'),
		body('isRecurring').optional().isBoolean().withMessage('isRecurring must be boolean.'),
		body('rule').optional({ nullable: true }).trim().isLength({ min: 3, max: 120 }).withMessage('rule must be 3-120 characters when provided.'),
		body('description').optional({ nullable: true }).trim().isLength({ min: 3, max: 255 }).withMessage('Description must be 3-255 characters when provided.'),
	],
	validateRequest,
	updateHoliday
);
router.delete('/holidays/:id', authorizePermission('manageHoliday'), [param('id').isInt({ min: 1 }).withMessage('Valid holiday id is required.')], validateRequest, deleteHoliday);
router.post(
	'/delegations',
	[
		body('fromAdminId').isInt({ min: 1 }).withMessage('Valid fromAdminId required.'),
		body('toAdminId').isInt({ min: 1 }).withMessage('Valid toAdminId required.'),
		body('startDate').isISO8601().withMessage('Valid startDate required.'),
		body('endDate').isISO8601().withMessage('Valid endDate required.'),
		body('scope').isIn(['DEPARTMENT', 'GLOBAL']).withMessage('Scope must be DEPARTMENT or GLOBAL.'),
	],
	validateRequest,
	createDelegation
);
router.get('/delegations', getDelegations);
router.patch('/delegations/:id/deactivate', [param('id').isInt({ min: 1 }).withMessage('Valid id required.')], validateRequest, deactivateDelegation);
router.post('/recalculate-holiday-impact', recalculateOnHolidayChange);
router.post('/academic-year/reset', resetAcademicYear);
router.get('/audit-logs', getAuditLogs);
router.get('/users', getAllUsers);
router.patch('/users/:id/toggle', toggleUserStatus);
router.delete('/users/:id', deleteUser);

module.exports = router;
