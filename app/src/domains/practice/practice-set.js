import { ValidationError } from '../../errors/domain-errors.js';

// The practice set: the cards (words or phrases) of one session, at most the set size (new_per_day, 10). A word set has
// a kind: 'new' (New words only, the Нові слова practice) or 'review' (words already practised and owed today, the
// Запам'ятовування practice). Both kinds are kept apart and each is at most the set size. Phrases have one set with
// the old cards first (the unfinished ones, then the reviews due today) and new cards only in the room left. A set is
// pinned when its batch is shown and stays the session's cards until each one is finished, on that calendar day only;
// then the next set is planned the same way. Pure.

export const NEW_SET_KIND = 'new';
export const REVIEW_SET_KIND = 'review';
export const SET_KINDS = Object.freeze([NEW_SET_KIND, REVIEW_SET_KIND]);

// Throws a ValidationError for a set kind that is neither 'new' nor 'review'.
export function assertSetKind(kind) {
  if (!SET_KINDS.includes(kind)) throw new ValidationError(`kind must be one of ${SET_KINDS.join(', ')}`);
}

// The stored set of the given kind in the practice settings (readSettings): the new set (wordSet) or the review set
// (reviewSet), each null when none is stored.
export function readSetOfKind(settings, kind) {
  assertSetKind(kind);
  return kind === REVIEW_SET_KIND ? settings.reviewSet : settings.wordSet;
}

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
