// The practice set: the cards (words or phrases) of one session, at most the set size (new_per_day, 10). Old cards
// come first: the unfinished ones (still in the learning deck), then the reviews due today, most overdue first. New
// cards fill only the room that is left, so a hard day gives fewer new cards, or none. A set is pinned when its batch
// is shown and stays the session's cards until each one is finished, on that calendar day only; then the next set is
// planned the same way. Pure.

// The set as it is saved in the practice settings: { opened_on, opened_at, item_ids }, or null.
export function mapFromStoredSet(storedSet) {
  if (!storedSet || !Array.isArray(storedSet.item_ids)) return null;
  return Object.freeze({
    openedOn: storedSet.opened_on,
    openedAt: Number.isFinite(storedSet.opened_at) ? storedSet.opened_at : 0,
    itemIds: Object.freeze([...storedSet.item_ids]),
  });
}

export function mapToStoredSet(practiceSet) {
  return { opened_on: practiceSet.openedOn, opened_at: practiceSet.openedAt, item_ids: [...practiceSet.itemIds] };
}

// A set opened today at openedAt (milliseconds) that pins the given items.
export function openPracticeSet({ today, openedAt, itemIds }) {
  return Object.freeze({ openedOn: today, openedAt, itemIds: Object.freeze([...itemIds]) });
}

// The set still open: stored, opened today, with an item isPending says is not finished. Returns the set with its
// pendingIds (in pinned order), or null when the next set is due.
export function findOpenSet({ storedSet, today, isPending }) {
  if (!storedSet || storedSet.openedOn !== today) return null;
  const pendingIds = storedSet.itemIds.filter(isPending);
  return pendingIds.length ? Object.freeze({ ...storedSet, pendingIds: Object.freeze(pendingIds) }) : null;
}

// The old cards of the next set (oldIds in order, without repeats, up to setSize) and the room left for new cards.
export function planSetRoom({ oldIds, setSize }) {
  const setOldIds = [...new Set(oldIds)].slice(0, setSize);
  return Object.freeze({ oldIds: Object.freeze(setOldIds), room: setSize - setOldIds.length });
}
