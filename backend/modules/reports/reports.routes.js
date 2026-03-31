const express = require('express');
const { getLeaveReport, getAggregateStats } = require('./reports.controller');
const { verifyToken, authorizeRoles } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken, authorizeRoles('admin'));

router.get('/', getLeaveReport);
router.get('/stats', getAggregateStats);

module.exports = router;
