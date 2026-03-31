const notificationsService = require('./notifications.service');
const { asyncHandler } = require('../../middleware/errorHandler');

const getMyNotifications = asyncHandler(async (req, res) => {
  const data = await notificationsService.listMine(req.user.userId, req.query.limit);
  res.json({ success: true, data });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const data = await notificationsService.markRead(Number(req.params.id), req.user.userId);
  res.json({ success: true, data });
});

const processNotificationQueue = asyncHandler(async (_req, res) => {
  const data = await notificationsService.processQueue();
  res.json({ success: true, data });
});

module.exports = {
  getMyNotifications,
  markNotificationRead,
  processNotificationQueue,
};
