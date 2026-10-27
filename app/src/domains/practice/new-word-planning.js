// Plans the New words on offer: the backlog gate, the learning deck's free slots (the day's count plus today's extra
// words, minus the words in the deck), the intake block (its pinned words still New, or a fresh allocation of the free
// slots when no block is open), and the refusal of extra words while the block is not finished. Reads the words through
// the practice repository and writes nothing.
import { ConflictError } from '../../errors/domain-errors.js';
import { countExtraItemsToday, resolveIntakeBlock } from './intake-block.js';
import { allocateNewWords, calculateNewWordAllowance } from './new-word-allocation.js';
import { findStartOfDay } from './practice-calendar.js';
import { compareQueueOrder, parseChapterNumber } from './priority-calculation.js';

const PRIORITY_VALUES = Object.freeze([1, 2, 3]);
const NO_INTRODUCTIONS_BY_PRIORITY = Object.freeze({ 1: 0, 2: 0, 3: 0 });

export function createNewWordPlanner({ practiceRepository }) {
  // The New words on offer, shared by the batch, the statistics, grading and addExtraNewWords.
  // allocatedCandidates is the block's leftovers that gradedWordIds (graded in this session) do not hold back, or the
  // day's pick when no block is open. offeredCandidates is what the batch returns: none while a word is overdue
  // (counted over all words, not only this session), so isBlocked is true only when that holds back some words.
  // newTodayRemainingCount counts what is still to be started: the block's leftovers, or the day's pick.
  // A word in the deck holds a slot until it is learned, so words missed yesterday leave fewer slots for new ones.
  function planNewWords({ settings, today, gradedWordIds }) {
    const todayStart = findStartOfDay(today, settings.timeZone);
    const overdueCount = practiceRepository.countWordsDueBefore(todayStart);
    const newWordRows = listNewWordRows();
    const block = resolveIntakeBlock({
      storedBlock: settings.newWordBlock,
      today,
      newItemIds: new Set(newWordRows.map(word => word.id)),
    });
    const deckSize = practiceRepository.countDeckWords();
    const extraNewWordsToday = countExtraItemsToday({ block, today });
    const deckFreeSlotCount = Math.max(0, settings.newPerDay + extraNewWordsToday - deckSize);
    const candidatesByPriority = groupCandidatesByPriority(newWordRows, gradedWordIds);
    const allocatedCandidates = block.isFresh
      ? allocateBlockCandidates({ settings, candidatesByPriority, blockSize: deckFreeSlotCount })
      : findLeftoverCandidates(newWordRows, block.leftoverIds)
        .filter(candidate => !gradedWordIds.has(candidate.id))
        .slice(0, deckFreeSlotCount);
    const isBlocked = overdueCount > 0 && allocatedCandidates.length > 0;
    const offeredCandidates = isBlocked ? [] : allocatedCandidates;
    return {
      block,
      overdueCount,
      isBlocked,
      allocatedCandidates,
      offeredCandidates,
      introducedTodayCount: sumCounts(practiceRepository.countIntroducedOnByPriority(today)),
      newTodayRemainingCount: block.isFresh
        ? allocatedCandidates.length
        : Math.min(block.leftoverIds.length, deckFreeSlotCount),
      extraNewWordsToday,
      deckSize,
      deckFreeSlotCount,
      remainingByPriority: countRemainingCandidates(candidatesByPriority, offeredCandidates),
    };
  }

  // The ids of count extra New words, picked like a block of count (7, 2, 1 per 10) from the New words outside it.
  function planExtraNewWordIds({ settings, count, blockWordIds }) {
    const candidatesByPriority = groupCandidatesByPriority(listNewWordRows(), new Set(blockWordIds));
    return allocateBlockCandidates({ settings, candidatesByPriority, blockSize: count }).map(candidate => candidate.id);
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

  function listNewWordRows() {
    return practiceRepository.listPracticeWords().filter(word => word.fsrs_card === null);
  }

  return Object.freeze({ planNewWords, planExtraNewWordIds, assertExtraNewWordsAllowed });
}

// The block's leftovers, in the order they were pinned.
function findLeftoverCandidates(newWordRows, leftoverWordIds) {
  const wordById = new Map(newWordRows.map(word => [word.id, word]));
  return leftoverWordIds.map(wordId => mapToQueueCandidate(wordById.get(wordId)));
}

// Words in queue order, grouped by priority; excludedWordIds (graded in this session) are left out.
function groupCandidatesByPriority(newWordRows, excludedWordIds) {
  const candidates = newWordRows
    .filter(word => !excludedWordIds.has(word.id))
    .map(mapToQueueCandidate)
    .sort(compareQueueOrder);
  const candidatesByPriority = { 1: [], 2: [], 3: [] };
  for (const candidate of candidates) candidatesByPriority[candidate.priority].push(candidate);
  return candidatesByPriority;
}

function allocateBlockCandidates({ settings, candidatesByPriority, blockSize }) {
  const { scaledTierQuota } = calculateNewWordAllowance({
    newPerDay: settings.newPerDay,
    tierQuota: settings.tierQuota,
    blockSize,
  });
  return allocateNewWords({
    candidatesByPriority,
    introducedTodayByPriority: NO_INTRODUCTIONS_BY_PRIORITY,
    newPerDay: blockSize,
    tierQuota: scaledTierQuota,
  });
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
