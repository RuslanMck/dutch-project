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
  assert.equal(afterSkippedDays.new_words.length, 0, 'no new words while the 10 started words fill the deck');
  assert.equal(afterSkippedDays.counts.deck_free_slots, 0);
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
  assert.equal(context.practiceSettings.readSettings().newWordBlock.itemIds.length, 20);

  context.practiceResetService.resetPractice({ isDryRun: false });

  assert.equal(context.practiceSettings.readSettings().newWordBlock, null);
});

test('reset mid-session: words and phrases graded earlier in session S are offered again and can be graded', () => {
  const context = createMigratedContext();
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const gradedWords = firstBatch.reviews.slice(0, 3);
  for (const word of gradedWords) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  }
  const phraseBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  const gradedPhrases = phraseBatch.new_phrases.slice(0, 2);
  for (const phrase of gradedPhrases) {
    context.phrasePracticeService.gradePhrase({ phraseId: phrase.id, grade: 'good', sessionId: 's1' });
  }
  context.clock.moveTo(MORNING_IN_AMSTERDAM);
  context.practiceResetService.resetPractice({ isDryRun: false });
  context.clock.moveTo('2026-10-26T10:05:00+01:00');

  const batchAfterReset = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const phraseBatchAfterReset = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  const offeredWordIds = batchAfterReset.new_words.map(word => word.id);
  const offeredPhraseIds = phraseBatchAfterReset.new_phrases.map(phrase => phrase.id);
  for (const word of gradedWords) {
    assert.ok(offeredWordIds.includes(word.id), `${word.nl} is offered again in session s1`);
  }
  for (const phrase of gradedPhrases) {
    assert.ok(offeredPhraseIds.includes(phrase.id), `${phrase.nl} is offered again in session s1`);
  }

  const regradedWord = context.practiceService.gradeWord({
    wordId: gradedWords[0].id,
    grade: 'hard',
    answer: 'x',
    sessionId: 's1',
  });
  assert.equal(regradedWord.word.id, gradedWords[0].id);
  context.phrasePracticeService.gradePhrase({ phraseId: gradedPhrases[0].id, grade: 'again', sessionId: 's1' });

  const repeat = context.practiceService.gradeWord({ wordId: gradedWords[0].id, grade: 'good', sessionId: 's1' });
  assert.equal(repeat.is_repeat, true, 'a second word grade after the reset is a repeat: only the deck moves');
  assert.throws(() => context.phrasePracticeService.gradePhrase({
    phraseId: gradedPhrases[0].id,
    grade: 'good',
    sessionId: 's1',
  }), ConflictError);
});

test('a dry run supersedes no review log; a real reset supersedes every log that counted, and keeps it', () => {
  const context = createMigratedContext();
  const [firstWord, secondWord] = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  context.practiceService.gradeWord({ wordId: firstWord.id, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: secondWord.id, grade: 'again', answer: 'x', sessionId: 's1' });
  const [firstPhrase] = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' }).new_phrases;
  context.phrasePracticeService.gradePhrase({ phraseId: firstPhrase.id, grade: 'good', sessionId: 's1' });
  const countingWordLogs = 'SELECT COUNT(*) FROM review_logs WHERE superseded_at IS NULL';
  const countingPhraseLogs = 'SELECT COUNT(*) FROM phrase_review_logs WHERE superseded_at IS NULL';
  assert.equal(countRows(context, countingWordLogs), 2);
  assert.equal(countRows(context, countingPhraseLogs), 1);

  context.practiceResetService.resetPractice({ isDryRun: true });
  assert.equal(countRows(context, countingWordLogs), 2, 'a dry run writes nothing');
  assert.equal(countRows(context, countingPhraseLogs), 1, 'a dry run writes nothing');

  context.clock.moveTo(MORNING_IN_AMSTERDAM);
  context.practiceResetService.resetPractice({ isDryRun: false });
  const resetAt = Date.parse(MORNING_IN_AMSTERDAM);
  assert.equal(countRows(context, countingWordLogs), 0);
  assert.equal(countRows(context, countingPhraseLogs), 0);
  assert.equal(countRows(context, `SELECT COUNT(*) FROM review_logs WHERE superseded_at = ${resetAt}`), 2);
  assert.equal(countRows(context, `SELECT COUNT(*) FROM phrase_review_logs WHERE superseded_at = ${resetAt}`), 1);
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM review_logs'), 2, 'the word logs stay as history');
  assert.equal(countRows(context, 'SELECT COUNT(*) FROM phrase_review_logs'), 1, 'the phrase log stays as history');
});

test('the database refuses a second log for a word in a session while the first one still counts; a second answer is a repeat', () => {
  const context = createMigratedContext();
  const [word] = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  const insertSecondLog = () => context.database.prepare(`
    INSERT INTO review_logs (word_id, session_id, reviewed_at, grade, card_after)
    VALUES (@wordId, 's1', @reviewedAt, 'good', '{}')
  `).run({ wordId: word.id, reviewedAt: context.clock.now() });

  assert.throws(insertSecondLog, /UNIQUE constraint failed/);
  const repeat = context.practiceService.gradeWord({ wordId: word.id, grade: 'hard', sessionId: 's1' });
  assert.equal(repeat.is_repeat, true);
  assert.equal(countRows(context, `SELECT COUNT(*) FROM review_logs WHERE word_id = ${word.id}`), 1);
});

test('after a reset the same session grades the word once more, and a third answer is a repeat', () => {
  const context = createMigratedContext();
  const [word] = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  context.practiceService.gradeWord({ wordId: word.id, grade: 'again', answer: 'x', sessionId: 's1' });
  context.clock.moveTo(MORNING_IN_AMSTERDAM);
  context.practiceResetService.resetPractice({ isDryRun: false });
  context.clock.moveTo('2026-10-26T10:05:00+01:00');

  const regraded = context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  assert.equal(regraded.grade, 'good');
  const thirdAnswer = context.practiceService.gradeWord({ wordId: word.id, grade: 'hard', sessionId: 's1' });
  assert.equal(thirdAnswer.is_repeat, true, 'the regrade counts, so a third answer in the session is a repeat');
  assert.equal(countRows(context, `SELECT COUNT(*) FROM review_logs WHERE word_id = ${word.id}`), 2);
  const countingLogs = `SELECT COUNT(*) FROM review_logs WHERE word_id = ${word.id} AND superseded_at IS NULL`;
  assert.equal(countRows(context, countingLogs), 1);
});
