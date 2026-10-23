import { EventEmitter } from 'node:events';

// Every write in repo.js calls notify(collection); /api/events (SSE) relays it to open pages.
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function notify(collection) {
  bus.emit('change', { collection, at: Date.now() });
}
