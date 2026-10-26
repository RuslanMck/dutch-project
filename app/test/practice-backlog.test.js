// The backlog gate and the extra new words for words, at service level with a fake clock: overdue words hold back the
// New words until they are graded, and addExtraNewWords adds today's allowance once today's New words are all used up.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMigrationCard, serializeCard } from '../src/domains/practice/fsrs-scheduling.js';
import { createPracticeRepository } from '../src/domains/practice/practice-repository.js';
import { ConflictError } from '../src/errors/domain-errors.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const NEXT_MORNING_IN_AMSTERDAM = '2026-10-25T12:00:00+01:00';

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return {
    now() {
      return currentTime;
    },
    moveTo(isoText) {
      currentTime = Date.parse(isoText);
    },
  };
}

function createPracticeContext(startIsoText = MORNING_IN_AMSTERDAM) {
  return createTestContext({ clock: createFakeClock(startIsoText) });
}

// Adds words to one textbook section; returns their ids.
function addWords(context, sectionCode, dutchTexts) {
  const wordInputs = dutchTexts.map(dutchText => ({
    nl: dutchText,
    uk: `${dutchText} (переклад)`,
    section: sectionCode,
  }));
  return context.wordService.createWords(wordInputs).added.map(word => word.id);
}

function makeNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-woord-${index + 1}`);
}

// P1: p1Count words in chapter 6. P2: p2Count words in chapter 3, ranked 3000 and up. P3: p3Count unranked words in
// chapter 3.
function addPriorityMix(context, { p1Count, p2Count, p3Count }) {
  const p2Names = makeNames('p2', p2Count);
  addWords(context, '6.1', makeNames('p1', p1Count));
  addWords(context, '3.2', p2Names);
  addWords(context, '3.2', makeNames('p3', p3Count));
  context.priorityService.importFrequencyList(
    p2Names.map((dutchText, index) => ({ wordForm: dutchText, frequencyRank: 3000 + index })),
    { shouldReplaceExisting: true },
  );
}

function migrate(context) {
  context.practiceService.migrateToFsrs({ isDryRun: false });
}

function countByPriority(words) {
  return {
    1: words.filter(word => word.priority === 1).length,
    2: words.filter(word => word.priority === 2).length,
    3: words.filter(word => word.priority === 3).length,
  };
}

// Gives a word a learning card due at dueAtText, as a migrated word would have.
function scheduleWord(context, wordId, dueAtText) {
  const dueAt = Date.parse(dueAtText);
  const practiceRepository = createPracticeRepository({ database: context.database });
  practiceRepository.updateWordSchedule(wordId, {
    fsrsCard: serializeCard(buildMigrationCard({ group: 'learning', dueAt, timestamp: dueAt })),
    dueAt,
    introducedOn: '2026-10-01',
    learningStatus: 'learning',
    updatedAt: dueAt,
  });
}

// Grades every word of a batch for the first time in one session, with good.
function gradeAllNewWords(context, batch, sessionId) {
  for (const word of batch.new_words) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId });
  }
}

test('overdue words hold back the new words: the reviews stay, no new word is offered, in any session', () => {
  const context = createPracticeContext();
  const [overdueId] = addWords(context, '6.1', ['oud']);
  addWords(context, '6.1', ['nieuw1', 'nieuw2']);
  migrate(context);
  scheduleWord(context, overdueId, '2026-10-23T12:00:00+02:00');

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.deepEqual(batch.reviews.map(word => word.id), [overdueId]);
  assert.deepEqual(batch.new_words, []);
  assert.equal(batch.counts.overdue, 1);
  assert.equal(batch.counts.new_words_blocked, true);
  assert.equal(batch.counts.new_today_remaining, 2, 'the two New words of the day are held back, not used up');
  assert.deepEqual(batch.counts.new_remaining_by_priority, { 1: 2, 2: 0, 3: 0 });
  assert.equal(context.practiceService.getPracticeBatch({ sessionId: 's2' }).counts.overdue, 1);
});

test('a word due earlier today is a review, not an overdue word, and holds nothing back', () => {
  const context = createPracticeContext();
  const [todayId] = addWords(context, '6.1', ['vandaag']);
  addWords(context, '6.1', ['nieuw1', 'nieuw2']);
  migrate(context);
  scheduleWord(context, todayId, '2026-10-24T09:00:00+02:00');

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.deepEqual(batch.reviews.map(word => word.id), [todayId]);
  assert.equal(batch.new_words.length, 2);
  assert.equal(batch.counts.overdue, 0);
  assert.equal(batch.counts.new_words_blocked, false);
});

test('no block is reported when overdue words exist but no new word would be offered', () => {
  const context = createPracticeContext();
  const [overdueId] = addWords(context, '6.1', ['oud']);
  migrate(context);
  scheduleWord(context, overdueId, '2026-10-23T12:00:00+02:00');

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.equal(batch.counts.overdue, 1);
  assert.equal(batch.counts.new_words_blocked, false);
  assert.deepEqual(batch.new_words, []);
});

test('grading the last overdue word unlocks the new words of the day in the same session', () => {
  const context = createPracticeContext();
  const [firstOverdueId, secondOverdueId] = addWords(context, '6.1', ['oud1', 'oud2']);
  const newWordIds = addWords(context, '6.1', ['nieuw1', 'nieuw2']);
  migrate(context);
  scheduleWord(context, firstOverdueId, '2026-10-22T12:00:00+02:00');
  scheduleWord(context, secondOverdueId, '2026-10-23T12:00:00+02:00');

  context.practiceService.gradeWord({ wordId: firstOverdueId, grade: 'good', sessionId: 's1' });
  const stillBlocked = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.equal(stillBlocked.counts.overdue, 1);
  assert.deepEqual(stillBlocked.new_words, []);

  context.practiceService.gradeWord({ wordId: secondOverdueId, grade: 'hard', answer: 'x', sessionId: 's1' });
  const unlocked = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.equal(unlocked.counts.overdue, 0);
  assert.equal(unlocked.counts.new_words_blocked, false);
  assert.deepEqual(unlocked.reviews, []);
  assert.deepEqual(unlocked.new_words.map(word => word.id), newWordIds);
});

test('a word graded again today is due tomorrow, so it does not hold back the new words', () => {
  const context = createPracticeContext();
  const [overdueId] = addWords(context, '6.1', ['oud']);
  addWords(context, '6.1', ['nieuw1', 'nieuw2']);
  migrate(context);
  scheduleWord(context, overdueId, '2026-10-23T12:00:00+02:00');
  context.practiceService.gradeWord({ wordId: overdueId, grade: 'again', answer: 'x', sessionId: 's1' });

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.equal(batch.counts.overdue, 0);
  assert.equal(batch.counts.new_words_blocked, false);
  assert.equal(batch.new_words.length, 2);
});

test('addExtraNewWords is refused while a word is overdue', () => {
  const context = createPracticeContext();
  const [overdueId] = addWords(context, '6.1', ['oud']);
  addWords(context, '6.1', makeNames('nieuw', 10));
  migrate(context);
  scheduleWord(context, overdueId, '2026-10-23T12:00:00+02:00');

  assert.throws(() => context.practiceService.addExtraNewWords({ count: 10 }), {
    name: 'ConflictError',
    message: /1 overdue words/,
  });
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 0);
});

test('addExtraNewWords is refused while today\'s regular new words are not used up', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 12));
  migrate(context);
  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  gradeAllNewWords(context, { new_words: batch.new_words.slice(0, 4) }, 's1');

  assert.throws(() => context.practiceService.addExtraNewWords({ count: 10 }), {
    name: 'ConflictError',
    message: "today's new words are not used up yet: 6 left",
  });
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 0);
});

test('after the regular 10 are introduced, addExtraNewWords(10) offers 10 more, split 7, 2 and 1', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 24, p2Count: 8, p3Count: 6 });
  migrate(context);
  gradeAllNewWords(context, context.practiceService.getPracticeBatch({ sessionId: 's1' }), 's1');

  const added = context.practiceService.addExtraNewWords({ count: 10 });
  const batch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(added, { extra_new_words_today: 10, new_today_remaining: 10 });
  assert.equal(batch.new_words.length, 10);
  assert.deepEqual(countByPriority(batch.new_words), { 1: 7, 2: 2, 3: 1 });
  assert.equal(batch.counts.introduced_today, 10);
  assert.equal(batch.counts.new_today_remaining, 10);
});

test('a second addExtraNewWords is refused until the first 10 are graded, then gives 10 more: 7, 2, 1', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 24, p2Count: 8, p3Count: 6 });
  migrate(context);
  gradeAllNewWords(context, context.practiceService.getPracticeBatch({ sessionId: 's1' }), 's1');
  assert.deepEqual(context.practiceService.addExtraNewWords({ count: 10 }), {
    extra_new_words_today: 10,
    new_today_remaining: 10,
  });

  assert.throws(() => context.practiceService.addExtraNewWords({ count: 10 }), {
    name: 'ConflictError',
    message: "today's new words are not used up yet: 10 left",
  });
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 10);

  gradeAllNewWords(context, context.practiceService.getPracticeBatch({ sessionId: 's2' }), 's2');
  assert.deepEqual(context.practiceService.addExtraNewWords({ count: 10 }), {
    extra_new_words_today: 20,
    new_today_remaining: 10,
  });

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's3' });
  assert.equal(batch.new_words.length, 10);
  assert.deepEqual(countByPriority(batch.new_words), { 1: 7, 2: 2, 3: 1 });
  assert.equal(batch.counts.new_today_remaining, 10);
});

test('extra words left unstarted carry over to the next day as the only new words', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 16, p2Count: 6, p3Count: 4 });
  migrate(context);
  gradeAllNewWords(context, context.practiceService.getPracticeBatch({ sessionId: 's1' }), 's1');
  context.practiceService.addExtraNewWords({ count: 10 });
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 10);
  const extraWordIds = context.practiceService.getPracticeBatch({ sessionId: 's2' }).new_words.map(word => word.id);

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);

  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 0);
  const nextDayBatch = context.practiceService.getPracticeBatch({ sessionId: 's3' });
  assert.deepEqual(nextDayBatch.new_words.map(word => word.id), extraWordIds, 'the same unstarted extra words');
  assert.equal(nextDayBatch.counts.introduced_today, 0);
  assert.equal(nextDayBatch.counts.new_today_remaining, 10);
  assert.throws(() => context.practiceService.addExtraNewWords({ count: 10 }), ConflictError);
});

test('practice_stats reports the overdue words, the block and the extra new words', () => {
  const context = createPracticeContext();
  const [overdueId] = addWords(context, '6.1', ['oud']);
  addWords(context, '6.1', makeNames('nieuw', 10));
  migrate(context);
  scheduleWord(context, overdueId, '2026-10-23T12:00:00+02:00');

  const blockedStats = context.practiceService.calculatePracticeStatistics();
  assert.equal(blockedStats.overdue, 1);
  assert.equal(blockedStats.new_words_blocked, true);
  assert.equal(blockedStats.extra_new_words_today, 0);

  context.practiceService.gradeWord({ wordId: overdueId, grade: 'good', sessionId: 's1' });
  const openStats = context.practiceService.calculatePracticeStatistics();
  assert.equal(openStats.overdue, 0);
  assert.equal(openStats.new_words_blocked, false);
});

test('a day left half done carries its leftovers over: the next day offers only them, the same words', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 20, p2Count: 6, p3Count: 4 });
  migrate(context);
  const todayWords = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  for (const word of todayWords.slice(0, 4)) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  }

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDayBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(nextDayBatch.new_words.map(word => word.id).sort(), todayWords.slice(4).map(word => word.id).sort());
  assert.equal(nextDayBatch.counts.new_today_remaining, 6);
  assert.throws(() => context.practiceService.addExtraNewWords({ count: 10 }), ConflictError);
});

test('a day with nothing done offers the same 10 words again, never more', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 20, p2Count: 6, p3Count: 4 });
  migrate(context);
  const todayWordIds = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words.map(word => word.id);

  context.clock.moveTo('2026-10-28T09:00:00+01:00');
  const laterBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(laterBatch.new_words.map(word => word.id), todayWordIds);
  assert.equal(laterBatch.reviews.length, 0);
});

test('finishing the leftovers of an earlier day opens a fresh 10 the same day', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 20, p2Count: 6, p3Count: 4 });
  migrate(context);
  const todayWords = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  context.practiceService.gradeWord({ wordId: todayWords[0].id, grade: 'good', sessionId: 's1' });

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const leftovers = context.practiceService.getPracticeBatch({ sessionId: 's2' }).new_words;
  assert.equal(leftovers.length, 9);
  for (const word of leftovers) context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's2' });
  const afterLeftovers = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.equal(afterLeftovers.new_words.length, 10);
  assert.equal(afterLeftovers.counts.new_today_remaining, 10);
  assert.equal(afterLeftovers.new_words.filter(word => leftovers.some(leftover => leftover.id === word.id)).length, 0);
});
