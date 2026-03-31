const EventEmitter = require('events');

const domainEvents = new EventEmitter();
domainEvents.setMaxListeners(100);

const EVENT_TYPES = {
  NOTIFICATION_ENQUEUE: 'notification.enqueue',
};

function emitEvent(type, payload = {}) {
  domainEvents.emit(type, payload);
}

module.exports = {
  domainEvents,
  EVENT_TYPES,
  emitEvent,
};
