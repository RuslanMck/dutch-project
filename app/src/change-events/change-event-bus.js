// In-process publish/subscribe of "collection changed". Services publish after a successful commit;
// the live-update stream (/api/events) subscribes and relays the events to open pages.
import { EventEmitter } from 'node:events';

const CHANGE_EVENT_NAME = 'change';
const MAXIMUM_LISTENER_COUNT = 100;

export function createChangeEventBus({ clock }) {
  const eventEmitter = new EventEmitter();
  eventEmitter.setMaxListeners(MAXIMUM_LISTENER_COUNT);

  function publishChange(collection) {
    eventEmitter.emit(CHANGE_EVENT_NAME, { collection, at: clock.now() });
  }

  // Returns a function that removes the listener again.
  function subscribeToChanges(listener) {
    eventEmitter.on(CHANGE_EVENT_NAME, listener);
    return () => eventEmitter.off(CHANGE_EVENT_NAME, listener);
  }

  return Object.freeze({ publishChange, subscribeToChanges });
}
