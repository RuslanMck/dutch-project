// The quick known check («Я це вже знаю»): which New words the check asks about, in queue order, and the days a word
// marked known comes back on. Pure: the caller passes the words, the ids already shown and the open set's ids.
import { compareQueueOrder } from './priority-calculation.js';
import { mapToQueueCandidate } from './word-set-planning.js';

export const KNOWN_CHECK_MINIMUM_DAYS = 14;
export const KNOWN_CHECK_MAXIMUM_DAYS = 28;

// The New words (no FSRS card) the check may ask about, in queue order (the same order as the practice queue): not in
// the open set of today and, unless includeSeen, not shown in a check before. wordRows are practice word rows.
export function listKnownCheckCandidates({ wordRows, seenWordIds, openSetWordIds, includeSeen = false }) {
  const seenIdSet = new Set(seenWordIds);
  const openSetIdSet = new Set(openSetWordIds);
  return wordRows
    .filter(wordRow => wordRow.fsrs_card === null)
    .filter(wordRow => !openSetIdSet.has(wordRow.id))
    .filter(wordRow => includeSeen || !seenIdSet.has(wordRow.id))
    .map(wordRow => ({ wordRow, candidate: mapToQueueCandidate(wordRow) }))
    .sort((first, second) => compareQueueOrder(first.candidate, second.candidate))
    .map(entry => entry.wordRow);
}

// The day offset (from today, in whole days) of each of count words marked known, in queue order: spread evenly over
// 14 to 28 days, so the words do not all come back on one day. Returns an array of length count.
export function spreadKnownCheckDays(count) {
  const dayCount = KNOWN_CHECK_MAXIMUM_DAYS - KNOWN_CHECK_MINIMUM_DAYS + 1;
  return Array.from({ length: count }, (_, index) => (
    KNOWN_CHECK_MINIMUM_DAYS + Math.floor((index * dayCount) / count)
  ));
}
