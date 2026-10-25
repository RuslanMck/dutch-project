// Unit tests for the pure practice modules: calendar, FSRS scheduling, priorities and new-word allocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { State } from 'ts-fsrs';

import {
  buildMigrationCard,
  createFsrsScheduler,
  deriveLearningStatus,
  describeCardState,
  calculateIntervalDays,
  parseCard,
  serializeCard,
} from '../src/domains/practice/fsrs-scheduling.js';
import { allocateNewWords, calculateNewWordAllowance } from '../src/domains/practice/new-word-allocation.js';
import {
  addDaysToCalendarDate,
  findStartOfDay,
  formatCalendarDateInTimeZone,
} from '../src/domains/practice/practice-calendar.js';
import {
  calculateFrequencyRank,
  calculatePriority,
  compareQueueOrder,
  parseChapterNumber,
} from '../src/domains/practice/priority-calculation.js';
import { ValidationError } from '../src/errors/domain-errors.js';

const TIME_ZONE = 'Europe/Amsterdam';
const MILLISECONDS_PER_DAY = 86_400_000;
const LEARNED_THRESHOLD_DAYS = 21;
const MAXIMUM_REVIEW_COUNT = 10;
const FIRST_REVIEW_TIMESTAMP = Date.UTC(2026, 9, 24, 12);

function createTestScheduler() {
  return createFsrsScheduler({ desiredRetention: 0.9, isFuzzEnabled: false });
}

function gradeGoodUntilLearned(scheduler) {
  let card = null;
  let timestamp = FIRST_REVIEW_TIMESTAMP;
  for (let reviewNumber = 1; reviewNumber <= MAXIMUM_REVIEW_COUNT; reviewNumber += 1) {
    const graded = scheduler.gradeCard(card, 'good', timestamp);
    card = graded.card;
    timestamp = graded.dueAt;
    if (deriveLearningStatus(card, LEARNED_THRESHOLD_DAYS) === 'learned') return { card, timestamp };
  }
  return assert.fail('a word graded good every time never reached learned');
}

function createCandidates(priority, count) {
  return Array.from({ length: count }, (value, index) => ({ id: priority * 100 + index, priority }));
}

function countByPriority(selectedWords) {
  return [1, 2, 3].map(priority => selectedWords.filter(word => word.priority === priority).length);
}

test('formatCalendarDateInTimeZone: Amsterdam in summer (UTC+2) changes the date at 22:00 UTC', () => {
  assert.equal(formatCalendarDateInTimeZone(Date.parse('2026-10-24T21:59:59Z'), TIME_ZONE), '2026-10-24');
  assert.equal(formatCalendarDateInTimeZone(Date.parse('2026-10-24T22:00:00Z'), TIME_ZONE), '2026-10-25');
});

test('findStartOfDay: 2026-10-25 starts at 22:00 UTC the day before (DST ends later that day)', () => {
  const startOfDay = findStartOfDay('2026-10-25', TIME_ZONE);
  assert.equal(startOfDay, Date.UTC(2026, 9, 24, 22));
  assert.equal(formatCalendarDateInTimeZone(startOfDay, TIME_ZONE), '2026-10-25');
  assert.equal(formatCalendarDateInTimeZone(startOfDay - 1, TIME_ZONE), '2026-10-24');
});

test('findStartOfDay: 2026-10-26 starts at 23:00 UTC, after DST has ended', () => {
  assert.equal(findStartOfDay('2026-10-26', TIME_ZONE), Date.UTC(2026, 9, 25, 23));
});

test('findStartOfDay: winter offset (UTC+1) in January', () => {
  assert.equal(findStartOfDay('2026-01-15', TIME_ZONE), Date.UTC(2026, 0, 14, 23));
});

test('findStartOfDay and format agree: 23:30 local on the 24th belongs to the 24th', () => {
  const lateEvening = Date.UTC(2026, 9, 24, 21, 30);
  assert.equal(formatCalendarDateInTimeZone(lateEvening, TIME_ZONE), '2026-10-24');
  assert.ok(lateEvening >= findStartOfDay('2026-10-24', TIME_ZONE));
  assert.ok(lateEvening < findStartOfDay('2026-10-25', TIME_ZONE));
});

test('addDaysToCalendarDate: crosses the year end and moves backwards', () => {
  assert.equal(addDaysToCalendarDate('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToCalendarDate('2026-03-01', -1), '2026-02-28');
});

test('gradeCard: on a new card, good is due later than hard, hard later than again (intervals 3, 2, 1)', () => {
  const scheduler = createTestScheduler();
  const again = scheduler.gradeCard(null, 'again', FIRST_REVIEW_TIMESTAMP);
  const hard = scheduler.gradeCard(null, 'hard', FIRST_REVIEW_TIMESTAMP);
  const good = scheduler.gradeCard(null, 'good', FIRST_REVIEW_TIMESTAMP);
  assert.ok(good.dueAt > hard.dueAt);
  assert.ok(hard.dueAt > again.dueAt);
  assert.deepEqual([good.intervalDays, hard.intervalDays, again.intervalDays], [3, 2, 1]);
});

test('gradeCard: rejects a grade other than again, hard or good', () => {
  const scheduler = createTestScheduler();
  assert.throws(() => scheduler.gradeCard(null, 'easy', FIRST_REVIEW_TIMESTAMP), ValidationError);
  assert.throws(() => scheduler.gradeCard(null, 'constructor', FIRST_REVIEW_TIMESTAMP), ValidationError);
});

test('gradeCard: repeated good answers reach learned once the interval reaches 21 days', () => {
  const scheduler = createTestScheduler();
  let card = null;
  let timestamp = FIRST_REVIEW_TIMESTAMP;
  const statusHistory = [];
  for (let reviewNumber = 1; reviewNumber <= MAXIMUM_REVIEW_COUNT; reviewNumber += 1) {
    const graded = scheduler.gradeCard(card, 'good', timestamp);
    card = graded.card;
    timestamp = graded.dueAt;
    statusHistory.push(deriveLearningStatus(card, LEARNED_THRESHOLD_DAYS));
  }
  assert.equal(statusHistory[0], 'learning');
  assert.ok(statusHistory.includes('learned'));
  assert.equal(statusHistory.at(-1), 'learned');
});

test('gradeCard: again after learned sends the word back to learning', () => {
  const scheduler = createTestScheduler();
  const { card, timestamp } = gradeGoodUntilLearned(scheduler);
  const graded = scheduler.gradeCard(card, 'again', timestamp);
  assert.equal(deriveLearningStatus(graded.card, LEARNED_THRESHOLD_DAYS), 'learning');
});

test('serializeCard and parseCard: a round trip gives the same next schedule', () => {
  const scheduler = createTestScheduler();
  const firstCard = scheduler.gradeCard(null, 'good', FIRST_REVIEW_TIMESTAMP).card;
  const restoredCard = parseCard(serializeCard(firstCard));
  assert.ok(restoredCard.due instanceof Date);
  assert.equal(
    scheduler.gradeCard(restoredCard, 'good', FIRST_REVIEW_TIMESTAMP + MILLISECONDS_PER_DAY).dueAt,
    scheduler.gradeCard(firstCard, 'good', FIRST_REVIEW_TIMESTAMP + MILLISECONDS_PER_DAY).dueAt,
  );
});

test('parseCard: null stays null and a card without last_review keeps it undefined', () => {
  assert.equal(parseCard(null), null);
  assert.equal(serializeCard(null), null);
  const parsedCard = parseCard(JSON.stringify({ due: '2026-10-27T12:00:00.000Z', state: 0, reps: 0 }));
  assert.equal(parsedCard.last_review, undefined);
  assert.equal(calculateIntervalDays(parsedCard), 0);
});

test('buildMigrationCard: a learning card is a Review card that is not yet learned', () => {
  const learningCard = buildMigrationCard({
    group: 'learning',
    dueAt: FIRST_REVIEW_TIMESTAMP + MILLISECONDS_PER_DAY,
    timestamp: FIRST_REVIEW_TIMESTAMP,
  });
  assert.equal(describeCardState(learningCard), 'review');
  assert.equal(deriveLearningStatus(learningCard, LEARNED_THRESHOLD_DAYS), 'learning');
});

test('buildMigrationCard: a learned card has a 21-day interval and is learned', () => {
  const learnedCard = buildMigrationCard({
    group: 'learned',
    dueAt: FIRST_REVIEW_TIMESTAMP + LEARNED_THRESHOLD_DAYS * MILLISECONDS_PER_DAY,
    timestamp: FIRST_REVIEW_TIMESTAMP,
  });
  assert.equal(calculateIntervalDays(learnedCard), LEARNED_THRESHOLD_DAYS);
  assert.equal(deriveLearningStatus(learnedCard, LEARNED_THRESHOLD_DAYS), 'learned');
});

test('calculateIntervalDays: the scheduled 21 days count as learned, though the due time is the start of a day', () => {
  // Reviewed at 23:30 on 24 October, due at 00:00 on 14 November: 20 days and 1.5 hours, which rounds to 20.
  const card = parseCard(JSON.stringify({
    due: new Date(findStartOfDay('2026-11-14', TIME_ZONE)).toISOString(),
    last_review: new Date(Date.parse('2026-10-24T23:30:00+02:00')).toISOString(),
    scheduled_days: LEARNED_THRESHOLD_DAYS,
    state: State.Review,
  }));
  assert.equal(calculateIntervalDays(card), LEARNED_THRESHOLD_DAYS);
  assert.equal(deriveLearningStatus(card, LEARNED_THRESHOLD_DAYS), 'learned');
});

test('buildMigrationCard: an unknown group is a validation error', () => {
  assert.throws(
    () => buildMigrationCard({ group: 'new', dueAt: FIRST_REVIEW_TIMESTAMP, timestamp: FIRST_REVIEW_TIMESTAMP }),
    ValidationError,
  );
});

test('deriveLearningStatus and describeCardState: null card is new, each FSRS state has its name', () => {
  assert.equal(deriveLearningStatus(null, LEARNED_THRESHOLD_DAYS), 'new');
  assert.equal(describeCardState(null), 'new');
  assert.equal(describeCardState({ state: State.New }), 'new');
  assert.equal(describeCardState({ state: State.Learning }), 'learning');
  assert.equal(describeCardState({ state: State.Review }), 'review');
  assert.equal(describeCardState({ state: State.Relearning }), 'relearning');
});

test('parseChapterNumber: integer before the first dot, otherwise null', () => {
  assert.equal(parseChapterNumber('6.1'), 6);
  assert.equal(parseChapterNumber('6'), 6);
  assert.equal(parseChapterNumber('Д1'), null);
  assert.equal(parseChapterNumber(null), null);
  assert.equal(parseChapterNumber('12.3'), 12);
});

test('calculatePriority: a manual override wins over every other rule', () => {
  assert.equal(
    calculatePriority({ priorityOverride: 3, chapterNumber: 6, frequencyRank: 1, currentChapter: 6 }),
    3,
  );
});

test('calculatePriority: the current chapter and the one before are P1', () => {
  const unrankedWord = { priorityOverride: null, frequencyRank: null, currentChapter: 6 };
  assert.equal(calculatePriority({ ...unrankedWord, chapterNumber: 6 }), 1);
  assert.equal(calculatePriority({ ...unrankedWord, chapterNumber: 5 }), 1);
});

test('calculatePriority: frequency rank limits 2000 (P1) and 5000 (P2), unranked is P3', () => {
  const chapterNotNear = { priorityOverride: null, chapterNumber: 4, currentChapter: 6 };
  assert.equal(calculatePriority({ ...chapterNotNear, frequencyRank: 3000 }), 2);
  assert.equal(calculatePriority({ ...chapterNotNear, frequencyRank: 1500 }), 1);
  assert.equal(calculatePriority({ ...chapterNotNear, frequencyRank: null }), 3);
  assert.equal(calculatePriority({ ...chapterNotNear, frequencyRank: 9000 }), 3);
});

test('compareQueueOrder: priority, then chapter, then rank (both unknown last), then id', () => {
  const candidates = [
    { id: 7, priority: 1, chapterNumber: null, frequencyRank: null },
    { id: 3, priority: 1, chapterNumber: null, frequencyRank: 5 },
    { id: 6, priority: 1, chapterNumber: 6, frequencyRank: null },
    { id: 2, priority: 1, chapterNumber: 6, frequencyRank: null },
    { id: 4, priority: 1, chapterNumber: 6, frequencyRank: 900 },
    { id: 1, priority: 1, chapterNumber: 5, frequencyRank: 10 },
    { id: 8, priority: 2, chapterNumber: 1, frequencyRank: 1 },
  ];
  const sortedIds = [...candidates].sort(compareQueueOrder).map(candidate => candidate.id);
  assert.deepEqual(sortedIds, [1, 4, 2, 6, 3, 7, 8]);
});

test('calculateFrequencyRank: a leading article is ignored and the word is looked up', () => {
  const rankByForm = new Map([['tafel', 1200]]);
  const findRankByForm = wordForm => rankByForm.get(wordForm) ?? null;
  assert.equal(calculateFrequencyRank('de tafel', findRankByForm), 1200);
  assert.equal(calculateFrequencyRank('Tafel.', findRankByForm), 1200);
  assert.equal(calculateFrequencyRank('tafel', findRankByForm), 1200);
});

test('calculateFrequencyRank: several forms give the largest rank, null when one is missing', () => {
  const rankByForm = new Map([
    ['hoe', 40],
    ['heet', 300],
    ['je', 25],
  ]);
  const findRankByForm = wordForm => rankByForm.get(wordForm) ?? null;
  assert.equal(calculateFrequencyRank('hoe heet je?', findRankByForm), 300);
  assert.equal(calculateFrequencyRank('hoe heet jij?', findRankByForm), null);
});

test('calculateFrequencyRank: a single word that is missing from the list is null', () => {
  assert.equal(calculateFrequencyRank('huis', () => null), null);
});

test('calculateFrequencyRank: zo\'n is looked up whole, not split into zo and n', () => {
  const rankByForm = new Map([['zo\'n', 4000]]);
  const findRankByForm = wordForm => rankByForm.get(wordForm) ?? null;
  assert.equal(calculateFrequencyRank('zo\'n', findRankByForm), 4000);
  assert.equal(calculateFrequencyRank('zo’n', findRankByForm), 4000, 'a curly apostrophe is the same apostrophe');
  const splitRankByForm = new Map([['zo', 90], ['n', 80]]);
  assert.equal(calculateFrequencyRank('zo\'n', wordForm => splitRankByForm.get(wordForm) ?? null), null);
});

test('calculateFrequencyRank: \'s ochtends uses \'s when listed, otherwise s', () => {
  const rankByForm = new Map([['ochtends', 800], ['s', 25]]);
  const findRankByForm = wordForm => rankByForm.get(wordForm) ?? null;
  assert.equal(calculateFrequencyRank('\'s ochtends', findRankByForm), 800);
  assert.equal(calculateFrequencyRank('\'s', findRankByForm), 25);
  assert.equal(calculateFrequencyRank('‘s ochtends', findRankByForm), 800);
});

test('calculateFrequencyRank: numbers are ignored, so voor 2? is ranked by voor alone', () => {
  const rankByForm = new Map([['heb', 60], ['je', 25], ['een', 15], ['tafel', 1200], ['voor', 30]]);
  const findRankByForm = wordForm => rankByForm.get(wordForm) ?? null;
  assert.equal(calculateFrequencyRank('voor 2?', findRankByForm), 30);
  assert.equal(calculateFrequencyRank('heb je een tafel voor 2?', findRankByForm), 1200);
  assert.equal(calculateFrequencyRank('2', findRankByForm), null, 'a number alone has no rank');
});

test('allocateNewWords: 7 P1, 2 P2, 1 P3 with ten slots and enough candidates', () => {
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 10), 2: createCandidates(2, 10), 3: createCandidates(3, 10) },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.deepEqual(countByPriority(selectedWords), [7, 2, 1]);
  assert.deepEqual(
    selectedWords.map(word => word.priority),
    [1, 1, 1, 1, 1, 1, 1, 2, 2, 3],
  );
});

test('allocateNewWords: an empty P3 gives its slot to P1', () => {
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 10), 2: createCandidates(2, 10), 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.deepEqual(countByPriority(selectedWords), [8, 2, 0]);
});

test('allocateNewWords: a short P1 passes the rest to P2, then P3', () => {
  const shortP1Words = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 3), 2: createCandidates(2, 10), 3: createCandidates(3, 10) },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.deepEqual(countByPriority(shortP1Words), [3, 6, 1]);

  const shortP1AndP2Words = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 3), 2: createCandidates(2, 1), 3: createCandidates(3, 10) },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.deepEqual(countByPriority(shortP1AndP2Words), [3, 1, 6]);
});

test('allocateNewWords: four introduced today (all P1) leaves 3 P1, 2 P2, 1 P3', () => {
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 10), 2: createCandidates(2, 10), 3: createCandidates(3, 10) },
    introducedTodayByPriority: { 1: 4, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.equal(selectedWords.length, 6);
  assert.deepEqual(countByPriority(selectedWords), [3, 2, 1]);
});

test('allocateNewWords: ten introduced today gives nothing more', () => {
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 10), 2: createCandidates(2, 10), 3: createCandidates(3, 10) },
    introducedTodayByPriority: { 1: 7, 2: 2, 3: 1 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.deepEqual(selectedWords, []);
});

test('allocateNewWords: never more words than candidates exist', () => {
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 1), 2: [], 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
  });
  assert.deepEqual(selectedWords.map(word => word.id), [100]);
});

test('calculateNewWordAllowance: no extra words keeps 10 a day and 7, 2, 1', () => {
  const allowance = calculateNewWordAllowance({ newPerDay: 10, tierQuota: { 1: 7, 2: 2, 3: 1 }, extraNewWordCount: 0 });
  assert.deepEqual(allowance, { effectiveNewPerDay: 10, scaledTierQuota: { 1: 7, 2: 2, 3: 1 } });
});

test('calculateNewWordAllowance: each block of 10 scales the tier quota, so 10 extra gives 20 and 14, 4, 2', () => {
  const allowance = calculateNewWordAllowance({
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
    extraNewWordCount: 10,
  });
  assert.deepEqual(allowance, { effectiveNewPerDay: 20, scaledTierQuota: { 1: 14, 2: 4, 3: 2 } });
});

test('calculateNewWordAllowance: a partly used block still counts as a block (11 gives two blocks)', () => {
  const allowance = calculateNewWordAllowance({ newPerDay: 10, tierQuota: { 1: 7, 2: 2, 3: 1 }, extraNewWordCount: 1 });
  assert.deepEqual(allowance, { effectiveNewPerDay: 11, scaledTierQuota: { 1: 14, 2: 4, 3: 2 } });
  const fourBlocks = calculateNewWordAllowance({
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
    extraNewWordCount: 21,
  });
  assert.deepEqual(fourBlocks, { effectiveNewPerDay: 31, scaledTierQuota: { 1: 28, 2: 8, 3: 4 } });
});

test('allocateNewWords with the scaled quota: 20 effective, 10 introduced 7, 2, 1, the next 10 split 7, 2, 1', () => {
  const allowance = calculateNewWordAllowance({
    newPerDay: 10,
    tierQuota: { 1: 7, 2: 2, 3: 1 },
    extraNewWordCount: 10,
  });
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: createCandidates(1, 20), 2: createCandidates(2, 20), 3: createCandidates(3, 20) },
    introducedTodayByPriority: { 1: 7, 2: 2, 3: 1 },
    newPerDay: allowance.effectiveNewPerDay,
    tierQuota: allowance.scaledTierQuota,
  });
  assert.equal(selectedWords.length, 10);
  assert.deepEqual(countByPriority(selectedWords), [7, 2, 1]);
});
