// Practice reset: every word and phrase back to New, today's extra words cleared, history kept; afterwards the batch
// holds only the day's 10 new words, and skipped days do not make the list grow.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConflictError } from '../src/errors/domain-errors.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-26T10:00:00+01:00';

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

function makeNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-woord-${index + 1}`);
}

// 20 learning words (they get cards on the migration) and 15 new ones, plus 3 phrases; FSRS is switched on.
function createMigratedContext() {
  const context = createTestContext({ clock: createFakeClock('2026-10-24T10:00:00+02:00') });
  const toWordInputs = (names, extraFields) => names
    .map(dutchText => ({ nl: dutchText, uk: 'переклад', ...extraFields }));
  context.wordService.createWords(toWordInputs(makeNames('oud', 20), { section: '6.1', status: 'learning' }));
  context.wordService.createWords(toWordInputs(makeNames('nieuw', 15), { section: '6.1' }));
  for (const dutchText of ['Hoe gaat het?', 'Tot ziens', 'Dank je wel']) {
    context.phraseService.createPhrase({ nl: dutchText, uk: 'фраза' });
  }
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return context;
}

function countRows(context, sql) {
  return context.database.prepare(sql).pluck().get();
}

test('reset_practice is refused before the FSRS migration', () => {
  const context = createTestContext();
  assert.throws(() => context.practiceResetService.resetPractice({ isDryRun: true }), ConflictError);
});

test('a dry run reports the counts and writes nothing', () => {
  const context = createMigratedContext();
  const batch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: batch.new_phrases[0].id, grade: 'good', sessionId: 's1' });
  const scheduledBefore = countRows(context, 'SELECT COUNT(*) FROM words WHERE fsrs_card IS NOT NULL');

  const summary = context.practiceResetService.resetPractice({ isDryRun: true });

  assert.deepEqual(summary, { dry_run: true, words_reset: 20, phrases_reset: 1 });
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM words WHERE fsrs_card IS NOT NULL'), scheduledBefore);
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM phrases WHERE fsrs_card IS NOT NULL'), 1);
});

test('after a reset every word and phrase is New, history is kept, and today holds exactly the 10 new words', () => {
  const context = createMigratedContext();
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const [firstReview] = firstBatch.reviews;
  context.practiceService.gradeWord({ wordId: firstReview.id, grade: 'again', answer: 'x', sessionId: 's1' });
  const errorCountBefore = countRows(context, 'SELECT COUNT(*) FROM word_errors');
  context.clock.moveTo(MORNING_IN_AMSTERDAM);

  const summary = context.practiceResetService.resetPractice({ isDryRun: false });

  assert.deepEqual(summary, { dry_run: false, words_reset: 20, phrases_reset: 0 });
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM words WHERE fsrs_card IS NOT NULL OR due_at IS NOT NULL'), 0);
  assert.equal(countRows(context, "SELECT COUNT(*) FROM words WHERE status <> 'new'"), 0);
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM review_logs'), 1, 'review history is kept');
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM word_errors'), errorCountBefore, 'error counts are kept');
  const batch = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.equal(batch.reviews.length, 0);
  assert.equal(batch.new_words.length, 10);
  assert.equal(batch.counts.overdue, 0);
  assert.equal(batch.counts.new_words_blocked, false);
});

test('after a reset, skipping days never makes the list grow beyond the words actually started', () => {
  const context = createMigratedContext();
  context.clock.moveTo(MORNING_IN_AMSTERDAM);
  context.practiceResetService.resetPractice({ isDryRun: false });

  context.clock.moveTo('2026-10-28T10:00:00+01:00');
  const untouchedBatch = context.practiceService.getPracticeBatch({ sessionId: 'later' });
  assert.equal(untouchedBatch.reviews.length + untouchedBatch.new_words.length, 10, 'nothing was started: still 10');

  for (const word of untouchedBatch.new_words) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'again', answer: 'x', sessionId: 'later' });
  }
  context.clock.moveTo('2026-10-31T10:00:00+01:00');
  const afterSkippedDays = context.practiceService.getPracticeBatch({ sessionId: 'much-later' });
  assert.equal(afterSkippedDays.reviews.length, 10, 'only the 10 started words come back');
  assert.equal(afterSkippedDays.new_words.length, 0, 'no new words while they are overdue');
  assert.equal(afterSkippedDays.counts.new_words_blocked, true);
});

test('a reset clears today\'s extra new words', () => {
  const context = createMigratedContext();
  context.clock.moveTo(MORNING_IN_AMSTERDAM);
  context.practiceResetService.resetPractice({ isDryRun: false });
  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  for (const word of batch.new_words) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  }
  context.practiceService.addExtraNewWords({ count: 10 });
  assert.equal(context.practiceSettings.readSettings().newWordBlock.size, 20);

  context.practiceResetService.resetPractice({ isDryRun: false });

  assert.equal(context.practiceSettings.readSettings().newWordBlock, null);
});
