// Plans the word sets of the session (practice-set.js), one per kind. The 'new' set: the open set's words still to
// finish, or the next set of New words by priority quota (7, 2, 1 per 10) in the room of the set size. The 'review'
// set: the open set's words still to finish, or the next set of the words already practised that are owed today
// (the learning deck's words and the reviews due before tomorrow, without today's New words and the words graded in
// this session), most important first (review-set-planning.js). A word is finished in an open set once it is in
// neither deck and has been answered in both directions since the set opened (19.3). Also the spare words the phone
// keeps offline. Reads the words through the practice repository and writes nothing.
import { PRACTICE_DIRECTIONS } from './practice-direction.js';
import {
  NEW_SET_KIND, REVIEW_SET_KIND, assertSetKind, findOpenSet, isWordOfSetKind, readSetOfKind,
} from './practice-set.js';
import { allocateNewWords, calculateNewWordAllowance } from './new-word-allocation.js';
import { addDaysToCalendarDate, findStartOfDay } from './practice-calendar.js';
import { calculateEffectiveRank, compareQueueOrder, parseChapterNumber } from './priority-calculation.js';
import { readDeckPositions } from './learning-deck.js';
import { mapToReviewCandidate, orderReviewCandidates } from './review-set-planning.js';

const NO_INTRODUCTIONS_BY_PRIORITY = Object.freeze({ 1: 0, 2: 0, 3: 0 });

export function createWordSetPlanner({ practiceRepository }) {
  // The words of the set of the given kind, in pinned order, for the batch, grading (which pins a planned set) and the
  // statistics. gradedWordIds (graded in this session) leaves those due reviews out of a planned review set. isOpen
  // says the set is pinned already; wordIds are then its words not finished yet. overdueCount counts the words due
  // before today. kind defaults to 'new'.
  function planWordSet({ settings, today, gradedWordIds, kind = NEW_SET_KIND }) {
    assertSetKind(kind);
    const storedSet = readSetOfKind(settings, kind);
    const overdueCount = practiceRepository.countWordsDueBefore(findStartOfDay(today, settings.timeZone));
    const answeredDirections = readAnsweredDirectionsOfOpenSet({ storedSet, today });
    const openSet = findOpenSet({
      storedSet,
      today,
      // A word of the other kind (a set saved before the split, or a mixed offline set) is not pending in this one.
      isPending: wordId => {
        const wordRow = practiceRepository.findPracticeWordById(wordId);
        if (wordRow && !isWordOfSetKind(wordRow, kind, storedSet.openedOn)) return false;
        return isWordPending(wordRow, answeredDirections.get(wordId) ?? new Set());
      },
    });
    if (openSet) {
      return Object.freeze({ isOpen: true, practiceSet: openSet, wordIds: openSet.pendingIds, overdueCount, kind });
    }
    const wordIds = kind === REVIEW_SET_KIND
      ? planReviewWordIds({ settings, today, excludedIds: gradedWordIds, count: settings.newPerDay })
      : planNewWordIds({ settings, newRows: listNewWordRows(), count: settings.newPerDay });
    return Object.freeze({ isOpen: false, practiceSet: null, wordIds: Object.freeze(wordIds), overdueCount, kind });
  }

  // The review words owed today (the deck's words and the reviews due before tomorrow's start), the ones introduced
  // today and the excluded ones left out: all of them, open review set included. Read only.
  function countReviewWordsOwed({ settings, today }) {
    return orderReviewCandidates({ candidates: listReviewCandidates({ settings, today }), today }).length;
  }

  // New words waiting outside the given set, per priority.
  function countNewWordsOutside(setWordIds) {
    const counts = { 1: 0, 2: 0, 3: 0 };
    const setWordIdSet = new Set(setWordIds);
    for (const word of listNewWordRows()) if (!setWordIdSet.has(word.id)) counts[word.priority] += 1;
    return counts;
  }

  function listNewWordRows() {
    return practiceRepository.listPracticeWords().filter(word => word.fsrs_card === null);
  }

  // The review candidates owed today: the learning deck's words and the reviews due before tomorrow's start, which
  // the deck and due queries keep apart. Read only.
  function listReviewCandidates({ settings, today }) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const reviewWordIds = [...new Set([
      ...practiceRepository.listDeckWordIds(),
      ...practiceRepository.listDueWordIds(tomorrowStart),
    ])];
    return practiceRepository.findPracticeWordsByIds(reviewWordIds).map(mapToReviewCandidate);
  }

  // The first count review words in review order, without the excluded ones and those introduced today.
  function planReviewWordIds({ settings, today, excludedIds, count }) {
    const candidates = listReviewCandidates({ settings, today });
    return orderReviewCandidates({ candidates, today, excludedIds }).slice(0, count).map(candidate => candidate.id);
  }

  // The first count New words of the set: by priority quota in queue order (the room is the whole set, so no old word
  // takes a place).
  function planNewWordIds({ settings, newRows, count }) {
    if (count <= 0) return [];
    const candidates = allocateSetCandidates({
      settings,
      candidatesByPriority: groupCandidatesByPriority(newRows, settings.currentChapter),
      room: count,
    });
    return candidates.map(candidate => candidate.id);
  }

  // The directions answered since the open set opened, by word id; empty when no set of today is open.
  function readAnsweredDirectionsOfOpenSet({ storedSet, today }) {
    if (!storedSet || storedSet.openedOn !== today || !storedSet.itemIds.length) return new Map();
    const answerRows = practiceRepository.listAnsweredDirectionsSince({
      wordIds: storedSet.itemIds,
      sinceTimestamp: storedSet.openedAt,
    });
    return mapAnsweredDirections(answerRows);
  }

  // The words the set of the given kind will most likely draw from next, for the phone to keep: for 'new' the New words
  // in queue order by the priority quota; for 'review' the review words owed today in review order. Both up to count
  // words, without excludeIds (the current set and the words graded in this session). Read only.
  function planSpareWords({ settings, today, excludeIds, count, kind = NEW_SET_KIND }) {
    assertSetKind(kind);
    const excludedIdSet = new Set(excludeIds);
    if (kind === REVIEW_SET_KIND) {
      return Object.freeze(planReviewWordIds({ settings, today, excludedIds: excludeIds, count }));
    }
    const newRows = listNewWordRows().filter(wordRow => !excludedIdSet.has(wordRow.id));
    return Object.freeze(planNewWordIds({ settings, newRows, count }));
  }

  return Object.freeze({ planWordSet, countNewWordsOutside, countReviewWordsOwed, planSpareWords });
}

// A word of the set is not finished while it is New, in a deck direction, or not yet answered in both directions. A
// deleted word is finished. answeredDirections: the directions (a Set) answered since the set opened.
export function isWordPending(wordRow, answeredDirections) {
  if (!wordRow) return false;
  if (wordRow.fsrs_card === null) return true;
  return listDirectionsLeft({ deckPositions: readDeckPositions(wordRow), answeredDirections }).length > 0;
}

// The directions a card of the set still owes: the directions in a deck, and those not answered since the set opened.
// Both are in PRACTICE_DIRECTIONS order.
export function listDirectionsLeft({ deckPositions, answeredDirections }) {
  return PRACTICE_DIRECTIONS.filter(direction => (
    deckPositions[direction] !== null || !answeredDirections.has(direction)
  ));
}

// The answer rows ({ word_id, direction }) as a Map from word id to the Set of directions answered.
export function mapAnsweredDirections(answerRows) {
  const directionsByWordId = new Map();
  for (const answerRow of answerRows) {
    if (!directionsByWordId.has(answerRow.word_id)) directionsByWordId.set(answerRow.word_id, new Set());
    directionsByWordId.get(answerRow.word_id).add(answerRow.direction);
  }
  return directionsByWordId;
}

// Words in queue order, grouped by priority.
function groupCandidatesByPriority(newWordRows, currentChapter) {
  const candidatesByPriority = { 1: [], 2: [], 3: [] };
  const queueCandidates = newWordRows.map(wordRow => mapToQueueCandidate(wordRow, currentChapter));
  for (const candidate of queueCandidates.sort(compareQueueOrder)) {
    candidatesByPriority[candidate.priority].push(candidate);
  }
  return candidatesByPriority;
}

// room New words, the tier quota (7, 2, 1 per 10) scaled to it.
function allocateSetCandidates({ settings, candidatesByPriority, room }) {
  const { scaledTierQuota } = calculateNewWordAllowance({
    newPerDay: settings.newPerDay,
    tierQuota: settings.tierQuota,
    blockSize: room,
  });
  return allocateNewWords({
    candidatesByPriority,
    introducedTodayByPriority: NO_INTRODUCTIONS_BY_PRIORITY,
    newPerDay: room,
    tierQuota: scaledTierQuota,
  });
}

export function mapToQueueCandidate(wordRow, currentChapter) {
  return {
    id: wordRow.id,
    priority: wordRow.priority,
    priorityOverride: wordRow.priority_override,
    effectiveRank: calculateEffectiveRank({
      frequencyRank: wordRow.frequency_rank,
      chapterNumber: parseChapterNumber(wordRow.section_code),
      currentChapter,
    }),
    category: wordRow.category ?? null,
    kind: wordRow.kind,
  };
}
