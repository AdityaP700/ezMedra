const commonRepository = require('../modules/common/common.repository');
const { domainEvents, EVENT_TYPES } = require('./eventBus');

let registered = false;

function registerEventHandlers() {
  if (registered) {
    return;
  }

  domainEvents.on(EVENT_TYPES.NOTIFICATION_ENQUEUE, async (payload) => {
    try {
      await commonRepository.enqueueNotificationEvent(payload.eventType || 'GENERIC_NOTIFICATION', {
        toUserId: payload.toUserId,
        title: payload.title,
        message: payload.message,
      });
    } catch (error) {
      // Event handling should never crash request flow.
      console.error('Event handler failure:', error.message);
    }
  });

  registered = true;
}

module.exports = { registerEventHandlers };
