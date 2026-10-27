// Practice services against an in-memory database and a fake clock: batches, grading, chapters and priorities, the
// migration to FSRS, the Amsterdam day boundary and the statistics. Fuzz is off, so due dates are exact.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMigrationCard, serializeCard } from '../src/domains/practice/fsrs-scheduling.js';
import { findStartOfDay } from '../src/domains/practice/practice-calendar.js';
import { createPracticeRepository } from '../src/domains/practice/practice-repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors/domain-errors.js';
import { createTestContext } from './database-test-helpers.js';

const TIME_ZONE = 'Europe/Amsterdam';
const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';

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

// Adds words to one textbook section (extra fields such as status or err pass through); returns their ids.
function addWords(context, sectionCode, dutchTexts, extraFields = {}) {
  const wordInputs = dutchTexts.map(dutchText => ({
    nl: dutchText,
    uk: `${dutchText} (переклад)`,
    section: sectionCode,
    ...extraFields,
  }));
  return context.wordService.createWords(wordInputs).added.map(word => word.id);
}

function makeNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-woord-${index + 1}`);
}

// P1: 9 words in chapter 6. P2: 4 words in chapter 3, ranked 3000 and up. P3: 3 unranked words in chapter 3.
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
  return context.practiceService.migrateToFsrs({ isDryRun: false });
}

function readWordRow(context, wordId) {
  return context.database.prepare('SELECT * FROM words WHERE id = ?').get(wordId);
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

test('the batch and grading are refused before the migration, and nothing is written', () => {
  const context = createPracticeContext();
  const [wordId] = addWords(context, '6.1', ['huis']);
  assert.throws(() => context.practiceService.getPracticeBatch({ sessionId: 's1' }), {
    name: 'ConflictError',
    message: FSRS_NOT_SET_UP_MESSAGE,
  });
  assert.throws(() => context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' }), ConflictError);
  assert.equal(readWordRow(context, wordId).fsrs_card, null);
});

test('a dry run reports the migration counts and writes nothing', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', ['leer1', 'leer2', 'leer3'], { status: 'learning' });
  addWords(context, '6.1', ['geleerd1', 'geleerd2'], { status: 'learned' });
  addWords(context, '6.1', ['nieuw1', 'nieuw2']);
  const summary = context.practiceService.migrateToFsrs({ isDryRun: true });
  assert.deepEqual(summary, {
    dry_run: true,
    learning: 3,
    learned: 2,
    new: 2,
    learning_due_by_day: { '2026-10-24': 1, '2026-10-25': 1, '2026-10-26': 1, '2026-10-27': 0 },
    learned_due_on: '2026-11-14',
  });
  const writtenCount = context.database.prepare(`
    SELECT COUNT(*) FROM words WHERE fsrs_card IS NOT NULL OR due_at IS NOT NULL OR introduced_on IS NOT NULL
  `).pluck().get();
  assert.equal(writtenCount, 0);
  assert.equal(context.practiceSettings.isFsrsActive(), false);
});

test('the real migration spreads learning words over 4 days, makes learned words due in 21 days, and keeps new words',
  () => {
    const context = createPracticeContext();
    const learningIds = addWords(context, '6.1', makeNames('leer', 8), { status: 'learning' });
    const learnedIds = addWords(context, '6.1', ['geleerd1', 'geleerd2'], { status: 'learned' });
    const newIds = addWords(context, '6.1', ['nieuw1', 'nieuw2']);

    const summary = migrate(context);

    assert.equal(summary.dry_run, false);
    assert.equal(summary.learning, 8);
    const expectedDayStarts = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']
      .map(calendarDate => findStartOfDay(calendarDate, TIME_ZONE));
    const learningDueAts = learningIds.map(wordId => readWordRow(context, wordId).due_at);
    assert.deepEqual([...new Set(learningDueAts)].sort(), expectedDayStarts);
    for (const dayStart of expectedDayStarts) {
      assert.equal(learningDueAts.filter(dueAt => dueAt === dayStart).length, 2);
    }
    for (const wordId of learningIds) assert.equal(context.wordService.getWord(wordId).status, 'learning');

    const learnedDueAt = findStartOfDay('2026-11-14', TIME_ZONE);
    for (const wordId of learnedIds) {
      assert.equal(readWordRow(context, wordId).due_at, learnedDueAt);
      assert.equal(context.wordService.getWord(wordId).status, 'learned');
    }

    for (const wordId of newIds) {
      const row = readWordRow(context, wordId);
      assert.equal(row.fsrs_card, null);
      assert.equal(row.due_at, null);
      assert.equal(row.introduced_on, null);
      assert.equal(context.wordService.getWord(wordId).status, 'new');
    }
    assert.equal(context.practiceSettings.isFsrsActive(), true);
  });

test('a second migration, dry or real, is refused', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', ['nieuw1']);
  migrate(context);
  assert.throws(() => context.practiceService.migrateToFsrs({ isDryRun: false }), ConflictError);
  assert.throws(() => context.practiceService.migrateToFsrs({ isDryRun: true }), ConflictError);
});

test('the migration publishes the words change once, after it commits', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', ['nieuw1']);
  const publishedCollections = [];
  context.changeEventBus.subscribeToChanges(event => publishedCollections.push(event.collection));
  migrate(context);
  assert.deepEqual(publishedCollections, ['words']);
});

test('the batch offers at most 10 new words, split 7, 2 and 1 by priority', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 9, p2Count: 4, p3Count: 3 });
  migrate(context);

  const batch = context.practiceService.getPracticeBatch({ sessionId: 'session-1' });

  assert.equal(batch.new_words.length, 10);
  assert.deepEqual(countByPriority(batch.new_words), { 1: 7, 2: 2, 3: 1 });
  assert.deepEqual(batch.reviews, []);
  assert.equal(batch.counts.due, 0);
  assert.equal(batch.counts.introduced_today, 0);
  assert.equal(batch.counts.new_today_remaining, 10);
  assert.deepEqual(batch.counts.new_remaining_by_priority, { 1: 2, 2: 2, 3: 2 });
});

test('an empty priority gives its slots to priority 1 first, then 2 and 3', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 12, p2Count: 4, p3Count: 0 });
  migrate(context);

  const batch = context.practiceService.getPracticeBatch({ sessionId: 'session-1' });

  assert.equal(batch.new_words.length, 10);
  assert.deepEqual(countByPriority(batch.new_words), { 1: 8, 2: 2, 3: 0 });
});

test('after 4 new words are graded, the next batch in a new session offers 6', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 9, p2Count: 4, p3Count: 3 });
  migrate(context);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 'session-1' });
  const gradedWordIds = firstBatch.new_words.slice(0, 4).map(word => word.id);
  for (const wordId of gradedWordIds) {
    context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 'session-1' });
  }

  const secondBatch = context.practiceService.getPracticeBatch({ sessionId: 'session-2' });

  assert.equal(secondBatch.new_words.length, 6);
  assert.equal(secondBatch.counts.introduced_today, 4);
  assert.equal(secondBatch.counts.new_today_remaining, 6);
  assert.ok(secondBatch.new_words.every(word => !gradedWordIds.includes(word.id)));
});

test('good, hard and again give FSRS due dates in that order; in the learning deck all three come back tomorrow', () => {
  const context = createPracticeContext();
  const [goodId, hardId, againId] = addWords(context, '6.1', ['goed', 'moeilijk', 'fout']);
  migrate(context);

  context.practiceService.gradeWord({ wordId: goodId, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: hardId, grade: 'hard', answer: 'de moeilijk', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: againId, grade: 'again', answer: 'xxx', sessionId: 's1' });

  const cardDueOf = wordId => Date.parse(JSON.parse(readWordRow(context, wordId).fsrs_card).due);
  assert.ok(cardDueOf(goodId) > cardDueOf(hardId), 'good must be due after hard');
  assert.ok(cardDueOf(hardId) > cardDueOf(againId), 'hard must be due after again');
  const tomorrowStart = findStartOfDay('2026-10-25', TIME_ZONE);
  for (const wordId of [goodId, hardId, againId]) assert.equal(readWordRow(context, wordId).due_at, tomorrowStart);
});

test('grading returns the word, the state and the next due day in Amsterdam', () => {
  const context = createPracticeContext();
  const [wordId] = addWords(context, '6.1', ['goed']);
  migrate(context);
  const result = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });
  assert.equal(result.grade, 'good');
  assert.equal(result.state, 'review');
  assert.equal(result.status, 'learning');
  assert.equal(result.word.id, wordId);
  assert.equal(result.word.state, 'review');
  assert.match(result.next_due_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(result.interval_days >= 1);
});

test('a second answer in one session is a repeat: FSRS and the review log stay, the learning deck moves', () => {
  const context = createPracticeContext();
  const [wordId] = addWords(context, '6.1', ['goed']);
  migrate(context);
  const first = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });
  assert.deepEqual(first.deck, { in_deck: true, required_correct: 2, correct_count: 1, times_left: 1, has_learned: false });
  const rowBefore = readWordRow(context, wordId);

  const repeat = context.practiceService.gradeWord({ wordId, grade: 'again', answer: 'x', sessionId: 's1' });

  assert.equal(repeat.is_repeat, true);
  assert.deepEqual(repeat.deck, { in_deck: true, required_correct: 3, correct_count: 1, times_left: 2, has_learned: false });
  const rowAfter = readWordRow(context, wordId);
  assert.equal(rowAfter.due_at, rowBefore.due_at);
  assert.equal(rowAfter.fsrs_card, rowBefore.fsrs_card);
  const countRows = tableName => context.database.prepare(`SELECT COUNT(*) FROM ${tableName} WHERE word_id = ?`).pluck()
    .get(wordId);
  assert.equal(countRows('review_logs'), 1);
  assert.equal(countRows('word_errors'), 0, 'a repeat adds no word error');
  assert.equal(countRows('deck_answers'), 2);
});

test('again and hard add a practice word error, good adds none', () => {
  const context = createPracticeContext();
  const [againId, hardId, goodId] = addWords(context, '6.1', ['fout', 'bijna', 'juist']);
  migrate(context);

  context.practiceService.gradeWord({ wordId: againId, grade: 'again', answer: 'xxx', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: hardId, grade: 'hard', answer: 'het bijna', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: goodId, grade: 'good', sessionId: 's1' });

  const errorRowOf = wordId => context.database.prepare(
    'SELECT source, mode, wrong_answer FROM word_errors WHERE word_id = ?',
  ).all(wordId).map(row => ({ ...row }));
  assert.deepEqual(errorRowOf(againId), [{ source: 'practice', mode: 'translate', wrong_answer: 'xxx' }]);
  assert.deepEqual(errorRowOf(hardId), [{ source: 'practice', mode: 'translate', wrong_answer: 'het bijna' }]);
  assert.deepEqual(errorRowOf(goodId), []);
});

test('grading rejects an unknown grade and an unknown word', () => {
  const context = createPracticeContext();
  const [wordId] = addWords(context, '6.1', ['goed']);
  migrate(context);
  assert.throws(() => context.practiceService.gradeWord({ wordId, grade: 'easy', sessionId: 's1' }), ValidationError);
  assert.throws(() => context.practiceService.gradeWord({ wordId: 999999, grade: 'good', sessionId: 's1' }),
    NotFoundError);
});

test('set_current_chapter moves chapter 5 out of priority 1 when the chapter becomes 7, and chapter 7 into it', () => {
  const context = createPracticeContext();
  const [fiveId] = addWords(context, '5.1', ['vijf']);
  const [sixId] = addWords(context, '6.1', ['zes']);
  const [sevenId] = addWords(context, '7.1', ['zeven']);
  context.priorityService.recalculatePriorities();
  assert.deepEqual([fiveId, sixId, sevenId].map(wordId => readWordRow(context, wordId).priority), [1, 1, 3]);

  const preview = context.priorityService.setCurrentChapter(7);

  assert.deepEqual([fiveId, sixId, sevenId].map(wordId => readWordRow(context, wordId).priority), [3, 1, 1]);
  assert.equal(preview.chapter, 7);
  assert.deepEqual(preview.counts, { 1: 2, 2: 0, 3: 1 });
  assert.equal(preview.unranked_count, 3);
});

test('preview_priorities changes nothing', () => {
  const context = createPracticeContext();
  const [fiveId] = addWords(context, '5.1', ['vijf']);
  context.priorityService.recalculatePriorities();
  const preview = context.priorityService.previewPriorities({ chapter: 9 });
  assert.equal(preview.chapter, 9);
  assert.deepEqual(preview.examples[3].map(example => example.id), [fiveId]);
  assert.equal(readWordRow(context, fiveId).priority, 1);
});

test('a manual priority survives a chapter change, and clearing it returns to the computed priority', () => {
  const context = createPracticeContext();
  const [fiveId] = addWords(context, '5.1', ['vijf']);
  context.priorityService.recalculatePriorities();

  context.priorityService.setWordPriority(fiveId, 2);
  assert.equal(context.wordService.getWord(fiveId).priority, 2);
  context.priorityService.setCurrentChapter(7);
  assert.equal(readWordRow(context, fiveId).priority, 2);
  assert.equal(readWordRow(context, fiveId).priority_override, 2);

  context.priorityService.setWordPriority(fiveId, null);
  assert.equal(readWordRow(context, fiveId).priority, 3);
  context.priorityService.setCurrentChapter(6);
  assert.equal(readWordRow(context, fiveId).priority, 1);
  assert.throws(() => context.priorityService.setWordPriority(999999, 1), NotFoundError);
});

test('a word due at 23:30 Amsterdam time today is in the batch, one due at 00:30 tomorrow is not', () => {
  const context = createPracticeContext('2026-10-24T12:00:00+02:00');
  const [dueTodayId, dueTomorrowId] = addWords(context, '6.1', ['vandaag', 'morgen']);
  migrate(context);
  scheduleWord(context, dueTodayId, '2026-10-24T23:30:00+02:00');
  scheduleWord(context, dueTomorrowId, '2026-10-25T00:30:00+02:00');

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(batch.reviews.map(word => word.id), [dueTodayId]);
  assert.equal(batch.counts.due, 1);

  const limitedBatch = context.practiceService.getPracticeBatch({ sessionId: 's2', maxReviews: 1 });
  assert.deepEqual(limitedBatch.reviews.map(word => word.id), [dueTodayId]);
});

test('on 2026-10-25, the 25-hour day when the clocks go back, the day still ends at midnight Amsterdam time', () => {
  const context = createPracticeContext('2026-10-25T00:10:00+02:00');
  const [lateId, nextDayId] = addWords(context, '6.1', ['laat', 'volgende']);
  migrate(context);
  scheduleWord(context, lateId, '2026-10-25T23:30:00+01:00');
  scheduleWord(context, nextDayId, '2026-10-26T00:30:00+01:00');

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(batch.reviews.map(word => word.id), [lateId]);
});

test('a grade at 23:30 counts for that day, and not for the next day', () => {
  const context = createPracticeContext('2026-10-24T23:30:00+02:00');
  const [wordId] = addWords(context, '6.1', ['laat']);
  migrate(context);

  const result = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });
  assert.equal(readWordRow(context, wordId).introduced_on, '2026-10-24');
  assert.equal(context.practiceService.calculatePracticeStatistics().introduced_today, 1);
  assert.match(result.next_due_on, /^\d{4}-\d{2}-\d{2}$/);

  context.clock.moveTo('2026-10-25T00:30:00+02:00');
  assert.equal(context.practiceService.calculatePracticeStatistics().introduced_today, 0);
  assert.equal(readWordRow(context, wordId).introduced_on, '2026-10-24');
});

test('a grade at 00:30 on the 25-hour day 2026-10-25 is due on 2026-10-26, at the start of that day', () => {
  const context = createPracticeContext('2026-10-25T00:30:00+02:00');
  const [wordId] = addWords(context, '6.1', ['fout']);
  migrate(context);

  const result = context.practiceService.gradeWord({ wordId, grade: 'again', answer: 'x', sessionId: 's1' });

  assert.equal(result.interval_days, 1);
  assert.equal(result.next_due_on, '2026-10-26');
  assert.equal(readWordRow(context, wordId).due_at, findStartOfDay('2026-10-26', TIME_ZONE));
  const nextBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.deepEqual(nextBatch.reviews.map(word => word.id), [wordId], 'not learned yet: it stays in the session');
});

test('a new word graded good at 20:00 on 2026-10-24 has its FSRS due on 2026-10-27, but the deck brings it back on 2026-10-25', () => {
  const context = createPracticeContext('2026-10-24T20:00:00+02:00');
  const [wordId] = addWords(context, '6.1', ['goed']);
  migrate(context);

  const result = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });

  assert.equal(JSON.parse(readWordRow(context, wordId).fsrs_card).due, new Date(findStartOfDay('2026-10-27', TIME_ZONE)).toISOString());
  assert.equal(result.interval_days, 1, 'a word in the learning deck comes back tomorrow');
  assert.equal(result.next_due_on, '2026-10-25');
  assert.equal(readWordRow(context, wordId).due_at, findStartOfDay('2026-10-25', TIME_ZONE));
});

test('practice_stats counts due words, introductions, states and the good share', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', ['leren'], { status: 'learning' });
  addWords(context, '6.1', ['geleerd'], { status: 'learned' });
  const [goodId, againId] = addWords(context, '6.1', ['goed', 'fout']);
  migrate(context);
  context.practiceService.gradeWord({ wordId: goodId, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: againId, grade: 'again', answer: 'x', sessionId: 's1' });

  const stats = context.practiceService.calculatePracticeStatistics();

  assert.equal(stats.due_today, 1);
  assert.equal(stats.due_tomorrow, 2, 'both new words are in the learning deck, so both are due tomorrow');
  assert.equal(stats.deck_size, 2);
  assert.equal(stats.deck_free_slots, 0, 'the session\'s new words are not learned yet');
  assert.equal(stats.introduced_today, 2, 'migrated words count as introduced the day before');
  assert.deepEqual(stats.new_remaining_by_priority, { 1: 0, 2: 0, 3: 0 });
  assert.equal(stats.states.new, 0);
  assert.equal(Object.values(stats.states).reduce((total, count) => total + count, 0), 4);
  assert.equal(stats.good_share_7_days, 0.5);
  assert.equal(stats.good_share_30_days, 0.5);
});

test('practice_stats before any grade has no good share', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', ['nieuw1']);
  const stats = context.practiceService.calculatePracticeStatistics();
  assert.equal(stats.good_share_7_days, null);
  assert.equal(stats.good_share_30_days, null);
  assert.deepEqual(stats.new_remaining_by_priority, { 1: 1, 2: 0, 3: 0 }, 'a chapter-6 word gets P1 when added');
  assert.equal(stats.states.new, 1);
});

test('importing the frequency list ranks every word and sets priorities, and an upsert only adds given forms', () => {
  const context = createPracticeContext();
  const [topId, midId, rarestId] = addWords(context, '3.1', ['topwoord', 'midwoord', 'zeldzaam']);
  const fillerEntries = Array.from({ length: 63998 }, (_, index) => ({
    wordForm: `vorm${index + 1}`,
    frequencyRank: index + 3,
  }));
  const entries = [
    { wordForm: 'topwoord', frequencyRank: 1 },
    { wordForm: 'midwoord', frequencyRank: 3000 },
    ...fillerEntries,
  ];

  const result = context.priorityService.importFrequencyList(entries, { shouldReplaceExisting: true });

  assert.deepEqual(result, { imported: 64000, words_ranked: 2, words_unranked: 1 });
  assert.deepEqual([topId, midId, rarestId].map(wordId => readWordRow(context, wordId).priority), [1, 2, 3]);

  const upsertResult = context.priorityService.importFrequencyList(
    [{ wordForm: 'ZELDZAAM', frequencyRank: 100 }],
    { shouldReplaceExisting: false },
  );
  assert.deepEqual(upsertResult, { imported: 1, words_ranked: 3, words_unranked: 0 });
  assert.equal(readWordRow(context, rarestId).priority, 1);
  assert.equal(readWordRow(context, topId).priority, 1);
});

test('a write publishes one words change after it commits; a dry run publishes nothing', () => {
  const context = createPracticeContext();
  const [wordId] = addWords(context, '6.1', ['goed']);
  let publishedChangeCount = 0;
  context.changeEventBus.subscribeToChanges(() => {
    publishedChangeCount += 1;
  });

  context.practiceService.migrateToFsrs({ isDryRun: true });
  assert.equal(publishedChangeCount, 0);

  migrate(context);
  const publishedByMigration = publishedChangeCount;
  context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });
  assert.equal(publishedChangeCount, publishedByMigration + 1);
});
