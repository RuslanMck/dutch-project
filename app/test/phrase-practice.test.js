// Phrase practice against an in-memory database and a fake clock: the refusal before the migration, the set of at
// most 10 phrases, grading once per direction and session, the second direction's worse grade, the due dates, the
// Amsterdam day boundary, the set's two rounds, the list fields and the statistics.
// Fuzz is off, so due dates are exact.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMigrationCard, parseCard, serializeCard } from '../src/domains/practice/fsrs-scheduling.js';
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

test('a set offers at most 10 new phrases, oldest first', () => {
  const context = createPhraseContext();
  const phraseIds = addPhrases(context, makeNames('Zin', 12));
  activatePractice(context);

  const batch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });

  assert.deepEqual(batch.new_phrases.map(phrase => phrase.id), phraseIds.slice(0, 10));
  assert.deepEqual(batch.reviews, []);
  assert.deepEqual(batch.counts, {
    set_size: 10,
    set_phrases: 10,
    set_new_phrases: 10,
    is_set_open: false,
    due: 0,
    overdue: 0,
    introduced_today: 0,
    new_remaining: 2,
  });
  assert.deepEqual(batch.new_phrases[0], {
    id: phraseIds[0],
    nl: 'Zin 1',
    uk: 'Zin 1 (переклад)',
    context: null,
    state: 'new',
    status: 'new',
    directions_left: ['uk_nl', 'nl_uk'],
  });
});

test('after two new phrases are graded, the next session keeps the set and leaves the graded ones out', () => {
  const context = createPhraseContext();
  const phraseIds = addPhrases(context, makeNames('Zin', 12));
  activatePractice(context);
  context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[0], grade: 'good', sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[1], grade: 'good', sessionId: 's1' });

  const nextBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });

  assert.deepEqual(nextBatch.new_phrases.map(phrase => phrase.id), phraseIds.slice(2, 10));
  assert.equal(nextBatch.counts.is_set_open, true);
  assert.equal(nextBatch.counts.introduced_today, 2);
  assert.equal(nextBatch.counts.new_remaining, 2);
});

test('good, hard and again give due dates in that order, and each result says when it is due next', () => {
  const context = createPhraseContext();
  const [goodId, hardId, againId] = addPhrases(context, ['goed', 'moeilijk', 'fout']);
  activatePractice(context);

  const goodResult = context.phrasePracticeService.gradePhrase({ phraseId: goodId, grade: 'good', sessionId: 's1' });
  const hardResult = context.phrasePracticeService.gradePhrase({ phraseId: hardId, grade: 'hard', sessionId: 's1' });
  const againResult = context.phrasePracticeService.gradePhrase({ phraseId: againId, grade: 'again', sessionId: 's1' });

  // Each phrase comes back tomorrow (its other direction is still to come); the card keeps the FSRS due day.
  const tomorrowStart = findStartOfDay('2026-10-25', TIME_ZONE);
  for (const phraseId of [goodId, hardId, againId]) assert.equal(readPhraseRow(context, phraseId).due_at, tomorrowStart);
  const cardDueOf = phraseId => new Date(parseCard(readPhraseRow(context, phraseId).fsrs_card).due).getTime();
  assert.ok(cardDueOf(goodId) > cardDueOf(hardId), 'good must be due after hard');
  assert.ok(cardDueOf(hardId) > cardDueOf(againId), 'hard must be due after again');
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

test('a phrase graded again stays in today\'s set for round 2, and comes back tomorrow once both are answered', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['fout']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1' });

  const roundTwoBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });
  assert.deepEqual(roundTwoBatch.reviews.map(phrase => [phrase.id, phrase.directions_left]), [[phraseId, ['nl_uk']]]);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's2', direction: 'nl_uk' });

  const todayBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's3' });
  assert.deepEqual(todayBatch.reviews, []);
  assert.deepEqual(todayBatch.new_phrases, []);

  context.clock.moveTo('2026-10-25T09:00:00+01:00');
  const tomorrowBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's4' });
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

test('a grade late in the evening counts for that Amsterdam day; after midnight a fresh set is planned', () => {
  const context = createPhraseContext('2026-10-24T23:30:00+02:00');
  const phraseIds = addPhrases(context, makeNames('Zin', 12));
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId: phraseIds[0], grade: 'good', sessionId: 's1' });

  assert.equal(readPhraseRow(context, phraseIds[0]).introduced_on, '2026-10-24');
  // The graded phrase stays in the set for its second direction.
  assert.equal(context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' }).counts.set_phrases, 10);

  // Due tomorrow, the phrase takes one of the next set's places as a review; the New phrases fill the rest.
  context.clock.moveTo('2026-10-25T00:10:00+02:00');
  const nextDayBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's3' });
  assert.equal(nextDayBatch.counts.introduced_today, 0);
  assert.equal(nextDayBatch.counts.is_set_open, false);
  assert.deepEqual(nextDayBatch.reviews.map(phrase => phrase.id), [phraseIds[0]]);
  assert.deepEqual(nextDayBatch.new_phrases.map(phrase => phrase.id), phraseIds.slice(1, 10));
});

test('a phrase graded again at 00:30 on the 25-hour day 2026-10-25 is due at the start of 2026-10-26', () => {
  const context = createPhraseContext('2026-10-25T00:30:00+02:00');
  const [phraseId] = addPhrases(context, ['fout']);
  activatePractice(context);

  const result = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1' });

  assert.equal(result.interval_days, 1);
  assert.equal(result.next_due_on, '2026-10-26');
  assert.equal(readPhraseRow(context, phraseId).due_at, findStartOfDay('2026-10-26', TIME_ZONE));
  assert.deepEqual(context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' }).reviews.map(phrase => phrase.id), [
    phraseId,
  ]);
});

test('a new phrase graded good at 20:00 on 2026-10-24 is due tomorrow; its card is due on 2026-10-27', () => {
  const context = createPhraseContext('2026-10-24T20:00:00+02:00');
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);

  const result = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });

  assert.equal(result.interval_days, 3);
  assert.equal(result.next_due_on, '2026-10-25');
  const row = readPhraseRow(context, phraseId);
  assert.equal(row.due_at, findStartOfDay('2026-10-25', TIME_ZONE));
  assert.equal(new Date(parseCard(row.fsrs_card).due).getTime(), findStartOfDay('2026-10-27', TIME_ZONE));
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
    due_tomorrow: 2,
    overdue: 0,
    introduced_today: 2,
    new_remaining: 2,
    set_size: 10,
    set_phrases_left: 4,
    is_set_open: true,
    states: { new: 2, learning: 0, review: 2, relearning: 0 },
  });
  assert.deepEqual(context.practiceService.calculatePracticeStatistics().phrases, statistics);

  context.clock.moveTo('2026-10-25T09:00:00+01:00');
  const nextDayStatistics = context.phrasePracticeService.calculatePhraseStatistics();
  assert.equal(nextDayStatistics.due_today, 2);
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
  assert.equal(listedById[gradedId].next_due_on, '2026-10-25');
  assert.equal(Object.hasOwn(listedById[gradedId], 'due_at'), false);
  assert.equal(listedById[gradedId].nl, 'gegradeerd', 'existing fields keep their names');
});

test('an overdue phrase takes a place in the set before the new phrases; it no longer holds them back', () => {
  const context = createPhraseContext();
  const [overdueId, newId] = addPhrases(context, ['oud', 'nieuw']);
  activatePractice(context);
  schedulePhrase(context, overdueId, Date.parse('2026-10-22T08:00:00Z'));

  const batch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(batch.reviews.map(phrase => phrase.id), [overdueId]);
  assert.deepEqual(batch.new_phrases.map(phrase => phrase.id), [newId]);
  assert.equal(batch.counts.overdue, 1);
});

test('a phrase graded again today is due tomorrow, so once both directions are answered it is out of today\'s set', () => {
  const context = createPhraseContext();
  const [overdueId] = addPhrases(context, ['oud', 'nieuw']);
  activatePractice(context);
  schedulePhrase(context, overdueId, Date.parse('2026-10-22T08:00:00Z'));
  context.phrasePracticeService.gradePhrase({ phraseId: overdueId, grade: 'again', sessionId: 's1' });

  const batch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });

  assert.equal(batch.counts.overdue, 0);
  assert.deepEqual(batch.reviews.map(phrase => [phrase.id, phrase.directions_left]), [[overdueId, ['nl_uk']]]);
  assert.equal(batch.new_phrases.length, 1);

  context.phrasePracticeService.gradePhrase({ phraseId: overdueId, grade: 'good', sessionId: 's2', direction: 'nl_uk' });
  const nextBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's3' });

  assert.deepEqual(nextBatch.reviews, []);
  assert.equal(nextBatch.new_phrases.length, 1);
});

// The phrase's review log and card in the session, read back as stored.
function readPhraseLog(context, phraseId, sessionId = 's1') {
  return context.database
    .prepare('SELECT * FROM phrase_review_logs WHERE phrase_id = ? AND session_id = ? AND superseded_at IS NULL')
    .get(phraseId, sessionId);
}

test('a phrase graded in both directions is logged once, with each direction\'s grade', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);

  const firstResult = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  const secondResult = context.phrasePracticeService.gradePhrase({
    phraseId,
    grade: 'good',
    sessionId: 's1',
    direction: 'nl_uk',
  });

  assert.equal(firstResult.direction, 'uk_nl');
  assert.equal(secondResult.direction, 'nl_uk');
  assert.equal(secondResult.interval_days, firstResult.interval_days);
  // The first direction is due tomorrow; the second one, answered, is due on the card's day.
  assert.equal(firstResult.next_due_on, '2026-10-25');
  assert.equal(readPhraseRow(context, phraseId).due_at, findStartOfDay(secondResult.next_due_on, TIME_ZONE));
  assert.notEqual(secondResult.next_due_on, firstResult.next_due_on);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_answers').pluck().get(), 2);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_review_logs').pluck().get(), 1);
  const log = readPhraseLog(context, phraseId);
  assert.equal(log.direction, 'uk_nl');
  assert.equal(log.grade, 'good');
  assert.equal(log.second_grade, 'good');
  assert.equal(readPhraseRow(context, phraseId).fsrs_card, log.card_after, 'a better second grade keeps the card');
});

test('a worse grade in the second direction grades the card again from its card before, with that grade', () => {
  const context = createPhraseContext('2026-10-24T20:00:00+02:00');
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);
  const firstResult = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  assert.equal(firstResult.next_due_on, '2026-10-25');

  const secondResult = context.phrasePracticeService.gradePhrase({
    phraseId,
    grade: 'again',
    sessionId: 's1',
    direction: 'nl_uk',
  });

  assert.equal(secondResult.grade, 'again');
  assert.equal(secondResult.interval_days, 1);
  assert.equal(secondResult.next_due_on, '2026-10-25');
  const row = readPhraseRow(context, phraseId);
  assert.equal(row.due_at, findStartOfDay('2026-10-25', TIME_ZONE));
  const log = readPhraseLog(context, phraseId);
  assert.equal(log.grade, 'good');
  assert.equal(log.second_grade, 'again');
  assert.equal(log.card_after, row.fsrs_card, 'the log\'s card after is the card the phrase now has');
  assert.equal(log.card_before, null, 'the card before is the New card');
});

test('a grade in the second direction that is not worse keeps the card, for better and for equal grades', () => {
  const context = createPhraseContext();
  const [hardGoodId, hardHardId] = addPhrases(context, ['eerste', 'tweede']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId: hardGoodId, grade: 'hard', sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: hardHardId, grade: 'hard', sessionId: 's1' });
  const hardGoodCard = readPhraseRow(context, hardGoodId).fsrs_card;
  const hardHardCard = readPhraseRow(context, hardHardId).fsrs_card;

  context.phrasePracticeService.gradePhrase({ phraseId: hardGoodId, grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  context.phrasePracticeService.gradePhrase({ phraseId: hardHardId, grade: 'hard', sessionId: 's1', direction: 'nl_uk' });

  assert.equal(readPhraseRow(context, hardGoodId).fsrs_card, hardGoodCard);
  assert.equal(readPhraseRow(context, hardHardId).fsrs_card, hardHardCard);
  assert.equal(readPhraseLog(context, hardGoodId).second_grade, 'good');
  assert.equal(readPhraseLog(context, hardHardId).second_grade, 'hard');
});

test('a second grade in the same direction is refused, in either direction, and nothing changes', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  const rowBefore = readPhraseRow(context, phraseId);

  assert.throws(
    () => context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1', direction: 'nl_uk' }),
    { name: 'ConflictError', message: `phrase ${phraseId} was already graded in session s1` },
  );
  assert.throws(
    () => context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 's1' }),
    ConflictError,
  );

  assert.deepEqual(readPhraseRow(context, phraseId), rowBefore);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_answers').pluck().get(), 2);
  assert.equal(readPhraseLog(context, phraseId).second_grade, 'good');
});

test('the set stays open until each phrase is answered in both directions, then the next set is planned', () => {
  const context = createPhraseContext();
  const [firstId, secondId, thirdId] = addPhrases(context, ['een', 'twee', 'drie']);
  activatePractice(context);
  context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  for (const phraseId of [firstId, secondId, thirdId]) {
    context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  }

  const roundTwoBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });
  assert.equal(roundTwoBatch.counts.is_set_open, true);
  assert.deepEqual(roundTwoBatch.reviews.map(phrase => phrase.id), [firstId, secondId, thirdId]);
  assert.ok(roundTwoBatch.reviews.every(phrase => phrase.directions_left.join() === 'nl_uk'));

  context.phrasePracticeService.gradePhrase({ phraseId: firstId, grade: 'good', sessionId: 's2', direction: 'nl_uk' });
  context.phrasePracticeService.gradePhrase({ phraseId: secondId, grade: 'good', sessionId: 's2', direction: 'nl_uk' });

  const lastBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's3' });
  assert.equal(lastBatch.counts.is_set_open, true);
  assert.equal(lastBatch.counts.set_phrases, 1);
  assert.deepEqual(lastBatch.reviews.map(phrase => phrase.id), [thirdId]);

  context.phrasePracticeService.gradePhrase({ phraseId: thirdId, grade: 'good', sessionId: 's3', direction: 'nl_uk' });

  const finishedBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's4' });
  assert.equal(finishedBatch.counts.is_set_open, false);
  assert.deepEqual(finishedBatch.reviews, []);
  assert.deepEqual(finishedBatch.new_phrases, []);
});

test('directions_left lists the directions a phrase has no answer for since the set opened, in order', () => {
  const context = createPhraseContext();
  const [ukFirstId, nlFirstId, untouchedId] = addPhrases(context, ['x', 'y', 'z']);
  activatePractice(context);
  const freshBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(freshBatch.new_phrases.map(phrase => phrase.directions_left), [
    ['uk_nl', 'nl_uk'],
    ['uk_nl', 'nl_uk'],
    ['uk_nl', 'nl_uk'],
  ]);

  context.phrasePracticeService.gradePhrase({ phraseId: ukFirstId, grade: 'good', sessionId: 's1' });
  context.phrasePracticeService.gradePhrase({ phraseId: nlFirstId, grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  const nextBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });

  const directionsLeftOf = phraseId => nextBatch.reviews.find(phrase => phrase.id === phraseId).directions_left;
  assert.deepEqual(directionsLeftOf(ukFirstId), ['nl_uk']);
  assert.deepEqual(directionsLeftOf(nlFirstId), ['uk_nl']);
  assert.deepEqual(nextBatch.new_phrases.map(phrase => phrase.id), [untouchedId]);
  assert.deepEqual(nextBatch.new_phrases[0].directions_left, ['uk_nl', 'nl_uk']);
});

test('a practice reset supersedes the phrase answers, so the phrase can be graded again in a direction', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  const phrasePracticeRepository = createPhrasePracticeRepository({ database: context.database });

  phrasePracticeRepository.markPhraseAnswersSuperseded(context.clock.now());

  assert.equal(phrasePracticeRepository.findPhraseAnswer({ sessionId: 's1', phraseId, direction: 'uk_nl' }), null);
  assert.deepEqual(phrasePracticeRepository.listPhraseDirectionsAnsweredSince(0), []);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_answers WHERE superseded_at IS NULL').pluck().get(), 0);
});

test('round 2 in another session of the day is the other direction: one FSRS grade, the second grade set', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 'session-a' });

  const reverse = context.phrasePracticeService.gradePhrase({
    phraseId, grade: 'again', sessionId: 'session-b', direction: 'nl_uk',
  });

  assert.equal(reverse.direction, 'nl_uk');
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_review_logs').pluck().get(), 1);
  const log = context.database.prepare('SELECT session_id, grade, second_grade, card_after FROM phrase_review_logs')
    .get();
  assert.equal(log.session_id, 'session-a');
  assert.equal(log.grade, 'good');
  assert.equal(log.second_grade, 'again');
  assert.equal(readPhraseRow(context, phraseId).fsrs_card, log.card_after, 'the card is graded again with the worse grade');
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_answers').pluck().get(), 2);
});

test('a same-direction answer of the day in another session is stored with no FSRS change', () => {
  const context = createPhraseContext();
  const [phraseId] = addPhrases(context, ['goed']);
  activatePractice(context);
  context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 'session-a' });
  const rowBefore = readPhraseRow(context, phraseId);

  const repeat = context.phrasePracticeService.gradePhrase({ phraseId, grade: 'again', sessionId: 'session-b' });

  assert.equal(repeat.direction, 'uk_nl');
  assert.equal(readPhraseRow(context, phraseId).fsrs_card, rowBefore.fsrs_card);
  assert.equal(readPhraseRow(context, phraseId).due_at, rowBefore.due_at);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_review_logs').pluck().get(), 1);
  assert.equal(context.database.prepare('SELECT second_grade FROM phrase_review_logs').pluck().get(), null);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM phrase_answers').pluck().get(), 2);
});
