// Plans the word set of the session (practice-set.js): the open set's words still to finish, or the next set: the
// learning deck's words, then the reviews due today (most overdue first), up to the set size, and New words by
// priority quota in the room that is left. Reads the words through the practice repository and writes nothing.
import { findOpenSet, planSetRoom } from './practice-set.js';
import { allocateNewWords, calculateNewWordAllowance } from './new-word-allocation.js';
import { addDaysToCalendarDate, findStartOfDay } from './practice-calendar.js';
import { compareQueueOrder, parseChapterNumber } from './priority-calculation.js';

const NO_INTRODUCTIONS_BY_PRIORITY = Object.freeze({ 1: 0, 2: 0, 3: 0 });

export function createWordSetPlanner({ practiceRepository }) {
  // The words of the set, old ones first, for the batch, grading (which pins a planned set) and the statistics.
  // gradedWordIds (graded in this session) leaves those due reviews out of a planned set. isOpen says the set is
  // pinned already; wordIds are then its words not finished yet. overdueCount counts the words due before today.
  function planWordSet({ settings, today, gradedWordIds }) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const overdueCount = practiceRepository.countWordsDueBefore(findStartOfDay(today, settings.timeZone));
    const openSet = findOpenSet({
      storedSet: settings.wordSet,
      today,
      isPending: wordId => isWordPending(practiceRepository.findPracticeWordById(wordId), tomorrowStart),
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

  return Object.freeze({ planWordSet, countNewWordsOutside });
}

// A word of the set is not finished while it is New, in the learning deck, or still due today. A deleted word is.
export function isWordPending(wordRow, tomorrowStart) {
  if (!wordRow) return false;
  if (wordRow.fsrs_card === null || wordRow.deck_required_correct !== null) return true;
  return wordRow.due_at !== null && wordRow.due_at < tomorrowStart;
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
