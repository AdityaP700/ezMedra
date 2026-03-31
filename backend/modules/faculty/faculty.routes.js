const express = require('express');
const { getPendingLeaves, forwardLeave, rejectLeave } = require('./faculty.controller');
const { verifyToken, authorizeRoles } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken, authorizeRoles('faculty', 'phd_scholar', 'ta'));

router.get('/leaves', getPendingLeaves);
router.patch('/leaves/:id/forward', forwardLeave);
router.patch('/leaves/:id/reject', rejectLeave);

module.exports = router;
