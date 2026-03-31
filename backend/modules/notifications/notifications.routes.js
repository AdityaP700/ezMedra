const express = require('express');
const { param } = require('express-validator');
const {
  getMyNotifications,
  markNotificationRead,
  processNotificationQueue,
} = require('./notifications.controller');
const { verifyToken, authorizeRoles } = require('../../middleware/auth.middleware');
const { validateRequest } = require('../../middleware/validate');

const router = express.Router();

router.use(verifyToken);
router.get('/me', getMyNotifications);
router.patch(
  '/:id/read',
  [param('id').isInt({ min: 1 }).withMessage('Valid notification id is required.')],
  validateRequest,
  markNotificationRead
);
router.post('/process-queue', authorizeRoles('admin'), processNotificationQueue);

module.exports = router;
