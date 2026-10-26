// Plans the New words on offer: the backlog gate, the intake block (the day's 10, extra blocks on request, and the
// leftovers of an unfinished block from an earlier day), the words offered by priority quota, and the refusal of extra
// new words while the block is not finished. Reads the words through the practice repository and writes nothing.
import { ConflictError } from '../../errors/domain-errors.js';
import { resolveIntakeBlock } from './intake-block.js';
import { allocateNewWords, calculateNewWordAllowance } from './new-word-allocation.js';
import { findStartOfDay } from './practice-calendar.js';
import { compareQueueOrder, parseChapterNumber } from './priority-calculation.js';

const PRIORITY_VALUES = Object.freeze([1, 2, 3]);

export function createNewWordPlanner({ practiceRepository }) {
  // The New words on offer, shared by the batch, the statistics, grading and addExtraNewWords. The backlog gate holds
  // them back while any word is overdue (counted over all words, not only this session); isBlocked is true only when
  // that actually holds back some words. Words started since the block opened count against it, so a block left
  // unfinished on an earlier day offers only its leftovers, and a new block opens only once it is finished.
  function planNewWords({ settings, today, gradedWordIds }) {
    const todayStart = findStartOfDay(today, settings.timeZone);
    const overdueCount = practiceRepository.countWordsDueBefore(todayStart);
    const block = resolveIntakeBlock({
      storedBlock: settings.newWordBlock,
      today,
      perDayCount: settings.newPerDay,
      introducedTotals: practiceRepository.countIntroducedByPriority(),
    });
    const { scaledTierQuota } = calculateNewWordAllowance({
      newPerDay: settings.newPerDay,
      tierQuota: settings.tierQuota,
      extraNewWordCount: Math.max(0, block.size - settings.newPerDay),
    });
    const candidatesByPriority = groupNewWordCandidatesByPriority(gradedWordIds);
    const allocatedCandidates = allocateNewWords({
      candidatesByPriority,
      introducedTodayByPriority: block.introducedByGroup,
      newPerDay: block.size,
      tierQuota: scaledTierQuota,
    });
    const isBlocked = overdueCount > 0 && allocatedCandidates.length > 0;
    const offeredCandidates = isBlocked ? [] : allocatedCandidates;
    return {
      block,
      overdueCount,
      isBlocked,
      offeredCandidates,
      introducedTodayCount: sumCounts(practiceRepository.countIntroducedOnByPriority(today)),
      newTodayRemainingCount: Math.max(0, block.size - block.introducedCount),
      extraNewWordsToday: block.openedOn === today ? Math.max(0, block.size - settings.newPerDay) : 0,
      remainingByPriority: countRemainingCandidates(candidatesByPriority, offeredCandidates),
    };
  }

  // Refused while a word is overdue, and while the intake block is not finished (its words are not all started), so
  // extra words come only once everything on offer has been started.
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

  return Object.freeze({ planNewWords, assertExtraNewWordsAllowed });
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
