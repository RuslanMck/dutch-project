// Plans the word set of the session (practice-set.js): the open set's words still to finish, or the next set: the
// learning deck's words, then the reviews due today (most overdue first), up to the set size, and New words by
// priority quota in the room that is left. A word is finished in an open set once it is in neither deck and has been
// answered in both directions since the set opened (19.3). Reads the words through the practice repository and writes
// nothing.
import { PRACTICE_DIRECTIONS } from './practice-direction.js';
import { findOpenSet, planSetRoom } from './practice-set.js';
import { allocateNewWords, calculateNewWordAllowance } from './new-word-allocation.js';
import { addDaysToCalendarDate, findStartOfDay } from './practice-calendar.js';
import { compareQueueOrder, parseChapterNumber } from './priority-calculation.js';
import { readDeckPositions } from './learning-deck.js';

const NO_INTRODUCTIONS_BY_PRIORITY = Object.freeze({ 1: 0, 2: 0, 3: 0 });

export function createWordSetPlanner({ practiceRepository }) {
  // The words of the set, old ones first, for the batch, grading (which pins a planned set) and the statistics.
  // gradedWordIds (graded in this session) leaves those due reviews out of a planned set. isOpen says the set is
  // pinned already; wordIds are then its words not finished yet. overdueCount counts the words due before today.
  function planWordSet({ settings, today, gradedWordIds }) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const overdueCount = practiceRepository.countWordsDueBefore(findStartOfDay(today, settings.timeZone));
    const answeredDirections = readAnsweredDirectionsOfOpenSet({ storedSet: settings.wordSet, today });
    const openSet = findOpenSet({
      storedSet: settings.wordSet,
      today,
      isPending: wordId => isWordPending(
        practiceRepository.findPracticeWordById(wordId),
        answeredDirections.get(wordId) ?? new Set(),
      ),
    });
    if (openSet) {
      return Object.freeze({ isOpen: true, practiceSet: openSet, wordIds: openSet.pendingIds, overdueCount });
    }
    const dueWordIds = practiceRepository.listDueWordIds(tomorrowStart).filter(wordId => !gradedWordIds.has(wordId));
    const { oldIds, room } = planSetRoom({
      oldIds: [...practiceRepository.listDeckWordIds(), ...dueWordIds],
      setSize: settings.newPerDay,
    });
    const newCandidates = room > 0
      ? allocateSetCandidates({ settings, candidatesByPriority: groupCandidatesByPriority(listNewWordRows()), room })
      : [];
    return Object.freeze({
      isOpen: false,
      practiceSet: null,
      wordIds: Object.freeze([...oldIds, ...newCandidates.map(candidate => candidate.id)]),
      overdueCount,
    });
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

  // The directions answered since the open set opened, by word id; empty when no set of today is open.
  function readAnsweredDirectionsOfOpenSet({ storedSet, today }) {
    if (!storedSet || storedSet.openedOn !== today || !storedSet.itemIds.length) return new Map();
    const answerRows = practiceRepository.listAnsweredDirectionsSince({
      wordIds: storedSet.itemIds,
      sinceTimestamp: storedSet.openedAt,
    });
    return mapAnsweredDirections(answerRows);
  }

  return Object.freeze({ planWordSet, countNewWordsOutside });
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
function groupCandidatesByPriority(newWordRows) {
  const candidatesByPriority = { 1: [], 2: [], 3: [] };
  for (const candidate of newWordRows.map(mapToQueueCandidate).sort(compareQueueOrder)) {
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

function mapToQueueCandidate(wordRow) {
  return {
    id: wordRow.id,
    priority: wordRow.priority,
    chapterNumber: parseChapterNumber(wordRow.section_code),
    frequencyRank: wordRow.frequency_rank,
  };
}
