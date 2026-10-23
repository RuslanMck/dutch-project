# change-events

In-process notification that a collection changed, so open pages can refetch it. Services publish after a successful commit; the live-update stream subscribes.

## Files

| File | What it does |
|---|---|
| `change-event-bus.js` | `createChangeEventBus`: `publishChange(collection)` emits `{ collection, at }`; `subscribeToChanges(listener)` returns a function that unsubscribes. |
