# change-events

In-process notification that a collection changed, so open pages can refetch it. Services publish after a successful commit; the server-sent events stream relays the events to browsers.

## Files

| File | What it does |
|---|---|
| `change-event-bus.js` | `createChangeEventBus`: `publishChange(collection)` emits `{ collection, at }`; `subscribeToChanges(listener)` returns a function that unsubscribes. |
| `server-sent-events-routes.js` | `GET /api/events`: streams change events as server-sent events, with a ping every 25 seconds. |
