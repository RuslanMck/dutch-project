// Phrase practice against an in-memory database and a fake clock: the refusal before the migration, the 5 New phrases
// a day, grading once per session, the due dates, the Amsterdam day boundary, the list fields and the statistics.
// Fuzz is off, so due dates are exact.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMigrationCard, serializeCard } from '../src/domains/practice/fsrs-scheduling.js';
import { createPhrasePracticeRepository } from '../src/domains/practice/phrase-practice-repository.js';
import { findStartOfDay } from '../src/domains/practice/practice-calendar.js';
import { ConflictError, NotFoundError } from '../src/errors/domain-errors.js';
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

function createPhraseContext(startIsoText = MORNING_IN_AMSTERDAM) {
  return createTestContext({ clock: createFakeClock(startIsoText) });
}

// Adds phrases one minute apart, so added_at puts them in the order given; returns their ids.
function addPhrases(context, dutchTexts) {
  return dutchTexts.map(dutchText => {
    const phrase = context.phraseService.createPhrase({ nl: dutchText, uk: `${dutchText} (переклад)` });
    context.clock.moveTo(new Date(context.clock.now() + 60_000).toISOString());
    return phrase.id;
  });
}

function makeNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function activatePractice(context) {
  context.practiceService.migrateToFsrs({ isDryRun: false });
}

function readPhraseRow(context, phraseId) {
  return context.database.prepare('SELECT * FROM phrases WHERE id = ?').get(phraseId);
}

// Gives a phrase a learning card due at dueAt (a timestamp), as a migrated phrase would have.
function schedulePhrase(context, phraseId, dueAt) {
  const phrasePracticeRepository = createPhrasePracticeRepository({ database: context.database });
  phrasePracticeRepository.updatePhraseSchedule(phraseId, {
    fsrsCard: serializeCard(buildMigrationCard({ group: 'learning', dueAt, timestamp: dueAt })),
    dueAt,
    introducedOn: '2026-10-01',
    learningStatus: 'learning',
  });
}

test('the phrase batch and grades are refused before the FSRS migration, and nothing is written', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['Hoe gaat het?']);
  assert.throws(() => context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' }), {
    name: 'ConflictError',
    message: FSRS_NOT_SET_UP_MESSAGE,
  });
  assert.throws(
    () => context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' }),
    ConflictError,
  );
  const row = readPhraseRow(context, phraseId);
  assert.equal(row.fsrs_card, null);
  assert.equal(row.status, 'new');
});

test('the batch offers at most 5 new phrases a day, oldest first', () => {
  const context = createPhraseContext();
  const phraseIds = addPhrases(context, makeNames('Zin', 7));
  activatePractice(context);

  const batch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });

  assert.deepEqual(batch.new_phrases.map(phrase => phrase.id), phraseIds.slice(0, 5));
  assert.deepEqual(batch.reviews, []);
  assert.deepEqual(batch.counts, { due: 0, introduced_today: 0, new_today_remaining: 5, new_remaining: 2 });
  assert.deepEqual(batch.new_phrases[0], {
    id: phraseIds[0],
    nl: 'Zin 1',
    uk: 'Zin 1 (переклад)',
    context: null,
    state: 'new',
    status: 'new',
  });
});

test('after two new phrases are graded, the next session offers 3 more and leaves the graded ones out', () => {
  const context = createPhraseContext();
  const phraseIds = addPhrases(context, makeNames('Zin', 7));
  activatePractice(context);
  context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[0], grade: 'good', sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[1], grade: 'good', sessionId: 's1' });

  const nextBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });

  assert.deepEqual(nextBatch.new_phrases.map(phrase => phrase.id), phraseIds.slice(2, 5));
  assert.deepEqual(nextBatch.counts, { due: 0, introduced_today: 2, new_today_remaining: 3, new_remaining: 2 });
});

test('good, hard and again give due dates in that order, and each result says when it is due next', () => {
  const context = createPhraseContext();
  const [goodId, hardId, againId] = addPhrases(context, ['goed', 'moeilijk', 'fout']);
  activatePractice(context);

  const goodResult = context.phrasePracticeService.gradePhrase({ phraseId: goodId, grade: 'good', sessionId: 's1' });
  const hardResult = context.phrasePracticeService.gradePhrase({ phraseId: hardId, grade: 'hard', sessionId: 's1' });
  const againResult = context.phrasePracticeService.gradePhrase({ phraseId: againId, grade: 'again', sessionId: 's1' });

  const dueAtOf = phraseId => readPhraseRow(context, phraseId).due_at;
  assert.ok(dueAtOf(goodId) > dueAtOf(hardId), 'good must be due after hard');
  assert.ok(dueAtOf(hardId) > dueAtOf(againId), 'hard must be due after again');
  assert.equal(goodResult.grade, 'good');
  assert.equal(goodResult.state, 'review');
  assert.equal(goodResult.status, 'learning');
  assert.equal(againResult.interval_days, 1);
  assert.equal(againResult.next_due_on, '2026-10-25');
  assert.equal(againResult.phrase.id, againId);
  assert.equal(againResult.phrase.next_due_on, '2026-10-25');
  assert.equal(readPhraseRow(context, hardId).introduced_on, '2026-10-24');
});

test('a second grade of the same phrase in one session is refused, and nothing changes', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  const rowBefore = readPhraseRow(context, phraseId);

  assert.throws(
    () => context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1' }),
    { name: 'ConflictError', message: `phrase ${phraseId} was already graded in session s1` },
  );

  const rowAfter = readPhraseRow(context, phraseId);
  assert.equal(rowAfter.fsrs_card, rowBefore.fsrs_card);
  assert.equal(rowAfter.due_at, rowBefore.due_at);
  assert.equal(rowAfter.status, rowBefore.status);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_review_logs').pluck().get(), 1);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM review_logs').pluck().get(), 0);
});

test('an unknown phrase is not found when graded', () => {
  const context = createPhraseContext();
  activatePractice(context);
  assert.throws(
    () => context.phrasePracticeService.gradePhrase({ phraseId: 999, grade: 'good', sessionId: 's1' }),
    NotFoundError,
  );
});

test('a phrase graded again is due tomorrow and comes back in tomorrow\'s batch, not today\'s', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['fout']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1' });

  const todayBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });
  assert.deepEqual(todayBatch.reviews, []);
  assert.ok(todayBatch.new_phrases.every(phrase => phrase.id !== phraseId));

  context.clock.moveTo('2026-10-25T09:00:00+01:00');
  const tomorrowBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's3' });
  assert.deepEqual(tomorrowBatch.reviews.map(phrase => phrase.id), [phraseId]);
  assert.equal(tomorrowBatch.reviews[0].state, 'review');
  assert.equal(tomorrowBatch.reviews[0].status, 'learning');
});

test('reviews are the phrases due before tomorrow, most overdue first, cut to maxReviews', () => {
  const context = createPhraseContext();
  const [oldestId, middleId, newestId] = addPhrases(context, ['a', 'b', 'c']);
  activatePractice(context);
  schedulePhrase(context, newestId, Date.parse('2026-10-24T08:00:00Z'));
  schedulePhrase(context, oldestId, Date.parse('2026-10-20T08:00:00Z'));
  schedulePhrase(context, middleId, Date.parse('2026-10-22T08:00:00Z'));

  const limitedBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1', maxReviews: 2 });

  assert.deepEqual(limitedBatch.reviews.map(phrase => phrase.id), [oldestId, middleId]);
  assert.equal(limitedBatch.counts.due, 3);
});

test('a phrase due at the start of tomorrow in Amsterdam waits for tomorrow, even at 23:30 today', () => {
  const context = createPhraseContext('2026-10-24T23:30:00+02:00');
  const [justBeforeId, startOfTomorrowId] = addPhrases(context, ['net voor', 'precies']);
  activatePractice(context);
  const startOfTomorrow = findStartOfDay('2026-10-25', TIME_ZONE);
  schedulePhrase(context, justBeforeId, startOfTomorrow - 1);
  schedulePhrase(context, startOfTomorrowId, startOfTomorrow);

  const lateBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(lateBatch.reviews.map(phrase => phrase.id), [justBeforeId]);

  context.clock.moveTo('2026-10-25T00:10:00+02:00');
  const nextDayBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });
  assert.deepEqual(nextDayBatch.reviews.map(phrase => phrase.id), [justBeforeId, startOfTomorrowId]);
});

test('a grade late in the evening counts for that Amsterdam day; the allowance starts again after midnight', () => {
  const context = createPhraseContext('2026-10-24T23:30:00+02:00');
  const phraseIds = addPhrases(context, makeNames('Zin', 6));
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[0], grade: 'good', sessionId: 's1' });

  assert.equal(readPhraseRow(context, phraseIds[0]).introduced_on, '2026-10-24');
  assert.equal(context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' }).counts.new_today_remaining, 4);

  context.clock.moveTo('2026-10-25T00:10:00+02:00');
  const nextDayBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's3' });
  assert.equal(nextDayBatch.counts.introduced_today, 0);
  assert.equal(nextDayBatch.counts.new_today_remaining, 5);
  assert.deepEqual(nextDayBatch.new_phrases.map(phrase => phrase.id), phraseIds.slice(1, 6));
});

test('a phrase graded again at 00:30 on the 25-hour day 2026-10-25 is due at the start of 2026-10-26', () => {
  const context = createPhraseContext('2026-10-25T00:30:00+02:00');
  const [phraseId] = addPhrases(context, ['fout']);
  activatePractice(context);

  const result = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1' });

  assert.equal(result.interval_days, 1);
  assert.equal(result.next_due_on, '2026-10-26');
  assert.equal(readPhraseRow(context, phraseId).due_at, findStartOfDay('2026-10-26', TIME_ZONE));
  assert.deepEqual(context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' }).reviews, []);
});

test('a new phrase graded good at 20:00 on 2026-10-24 is due on 2026-10-27, at the start of that day', () => {
  const context = createPhraseContext('2026-10-24T20:00:00+02:00');
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);

  const result = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });

  assert.equal(result.interval_days, 3);
  assert.equal(result.next_due_on, '2026-10-27');
  assert.equal(readPhraseRow(context, phraseId).due_at, findStartOfDay('2026-10-27', TIME_ZONE));
});

test('the statistics count due and tomorrow\'s phrases, introductions, New phrases and states', () => {
  const context = createPhraseContext();
  const phraseIds = addPhrases(context, makeNames('Zin', 4));
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[0], grade: 'good', sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[1], grade: 'again', sessionId: 's1' });

  const statistics = context.phrasePracticeService.calculatePhraseStatistics();

  assert.deepEqual(statistics, {
    due_today: 0,
    due_tomorrow: 1,
    introduced_today: 2,
    new_remaining: 2,
    states: { new: 2, learning: 0, review: 2, relearning: 0 },
  });
  assert.deepEqual(context.practiceService.calculatePracticeStatistics().phrases, statistics);

  context.clock.moveTo('2026-10-25T09:00:00+01:00');
  const nextDayStatistics = context.phrasePracticeService.calculatePhraseStatistics();
  assert.equal(nextDayStatistics.due_today, 1);
  assert.equal(nextDayStatistics.introduced_today, 0);
});

test('the phrase list shows status and the day a phrase is due, null while New', () => {
  const context = createPhraseContext();
  const [newId, gradedId] = addPhrases(context, ['nieuw', 'gegradeerd']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId: gradedId, grade: 'good', sessionId: 's1' });

  const listed = context.phraseService.listPhrases();
  const listedById = Object.fromEntries(listed.map(phrase => [phrase.id, phrase]));

  assert.equal(listedById[newId].status, 'new');
  assert.equal(listedById[newId].next_due_on, null);
  assert.equal(listedById[gradedId].status, 'learning');
  assert.match(listedById[gradedId].next_due_on, /^2026-10-2[78]$/);
  assert.equal(Object.hasOwn(listedById[gradedId], 'due_at'), false);
  assert.equal(listedById[gradedId].nl, 'gegradeerd', 'existing fields keep their names');
});
