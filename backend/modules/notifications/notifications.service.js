const commonRepository = require('../common/common.repository');
const { AppError } = require('../../middleware/errorHandler');

class NotificationsService {
  async listMine(userId, limit = 20) {
    return commonRepository.getUserNotifications(userId, Number(limit) || 20);
  }

  async markRead(id, userId) {
    const updated = await commonRepository.markNotificationRead(id, userId);
    if (!updated) {
      throw new AppError('Notification not found.', 404);
    }
    return updated;
  }

  async processQueue() {
    return commonRepository.processNotificationQueue(100);
  }
}

module.exports = new NotificationsService();
