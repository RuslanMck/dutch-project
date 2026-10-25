// Plans today's New words: the backlog gate, the day's allowance with the extra new words, the words offered by
// priority quota, and the refusal of extra new words while today's allowance is not used up. Reads the words through
// the practice repository and writes nothing.
import { ConflictError } from '../../errors/domain-errors.js';
import { allocateNewWords, calculateNewWordAllowance } from './new-word-allocation.js';
import { findStartOfDay } from './practice-calendar.js';
import { compareQueueOrder, parseChapterNumber } from './priority-calculation.js';

const PRIORITY_VALUES = Object.freeze([1, 2, 3]);

export function createNewWordPlanner({ practiceRepository }) {
  // The New words for today, shared by the batch, the statistics and addExtraNewWords. The backlog gate holds them back
  // while any word is overdue (counted over all words, not only this session); isBlocked is true only when that
  // actually holds back some words.
  function planNewWords({ settings, today, gradedWordIds }) {
    const todayStart = findStartOfDay(today, settings.timeZone);
    const overdueCount = practiceRepository.countWordsDueBefore(todayStart);
    const introducedTodayByPriority = practiceRepository.countIntroducedOnByPriority(today);
    const introducedTodayCount = sumCounts(introducedTodayByPriority);
    const { effectiveNewPerDay, scaledTierQuota } = calculateNewWordAllowance({
      newPerDay: settings.newPerDay,
      tierQuota: settings.tierQuota,
      extraNewWordCount: countExtraNewWordsOn(settings, today),
    });
    const candidatesByPriority = groupNewWordCandidatesByPriority(gradedWordIds);
    const allocatedCandidates = allocateNewWords({
      candidatesByPriority,
      introducedTodayByPriority,
      newPerDay: effectiveNewPerDay,
      tierQuota: scaledTierQuota,
    });
    const isBlocked = overdueCount > 0 && allocatedCandidates.length > 0;
    const offeredCandidates = isBlocked ? [] : allocatedCandidates;
    return {
      overdueCount,
      isBlocked,
      offeredCandidates,
      introducedTodayCount,
      newTodayRemainingCount: Math.max(0, effectiveNewPerDay - introducedTodayCount),
      remainingByPriority: countRemainingCandidates(candidatesByPriority, offeredCandidates),
    };
  }

  // Refused while a word is overdue, and while today's New words (regular and extra) are not all introduced yet, so the
  // extra words come only once the effective allowance of today is used up.
  function assertExtraNewWordsAllowed({ newWordPlan }) {
    if (newWordPlan.overdueCount > 0) {
      throw new ConflictError(`${newWordPlan.overdueCount} overdue words: review them before adding extra new words`);
    }
    if (newWordPlan.newTodayRemainingCount > 0) {
      throw new ConflictError(`today's new words are not used up yet: ${newWordPlan.newTodayRemainingCount} left`);
    }
  }

  function groupNewWordCandidatesByPriority(gradedWordIds) {
    const candidates = practiceRepository.listPracticeWords()
      .filter(word => word.fsrs_card === null && !gradedWordIds.has(word.id))
      .map(mapToQueueCandidate)
      .sort(compareQueueOrder);
    const candidatesByPriority = { 1: [], 2: [], 3: [] };
    for (const candidate of candidates) candidatesByPriority[candidate.priority].push(candidate);
    return candidatesByPriority;
  }

  return Object.freeze({ planNewWords, assertExtraNewWordsAllowed, countExtraNewWordsOn });
}

// The extra new words counted for a calendar date: the stored count when it was added on that date, otherwise zero.
function countExtraNewWordsOn(settings, calendarDate) {
  return settings.extraNewWords.calendarDate === calendarDate ? settings.extraNewWords.count : 0;
}

function mapToQueueCandidate(wordRow) {
  return {
    id: wordRow.id,
    priority: wordRow.priority,
    chapterNumber: parseChapterNumber(wordRow.section_code),
    frequencyRank: wordRow.frequency_rank,
    word: wordRow,
  };
}

function countRemainingCandidates(candidatesByPriority, offeredCandidates) {
  const remainingCounts = {};
  for (const priority of PRIORITY_VALUES) {
    const offeredCount = offeredCandidates.filter(candidate => candidate.priority === priority).length;
    remainingCounts[priority] = candidatesByPriority[priority].length - offeredCount;
  }
  return remainingCounts;
}

function sumCounts(countByPriority) {
  return PRIORITY_VALUES.reduce((total, priority) => total + (countByPriority[priority] ?? 0), 0);
}
