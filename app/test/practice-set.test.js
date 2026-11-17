// The practice sets for words and phrases, at service level with a fake clock: a set holds at most 10 cards, old ones
// first (words still being learned, then reviews due today, most overdue first), new ones only in the room left; a
// pinned set stays the session's cards until each is finished, on that day; then the next set is planned.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMigrationCard, serializeCard } from '../src/domains/practice/fsrs-scheduling.js';
import { PRACTICE_DIRECTIONS } from '../src/domains/practice/practice-direction.js';
import { createPhrasePracticeRepository } from '../src/domains/practice/phrase-practice-repository.js';
import { createPracticeRepository } from '../src/domains/practice/practice-repository.js';
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

function createPracticeContext() {
  return createTestContext({ clock: createFakeClock(MORNING_IN_AMSTERDAM) });
}

function makeNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
}

// Adds words to one textbook section; returns their ids.
function addWords(context, sectionCode, dutchTexts) {
  return context.wordService.createWords(dutchTexts.map(dutchText => ({
    nl: dutchText,
    uk: `${dutchText} (переклад)`,
    section: sectionCode,
  }))).added.map(word => word.id);
}

// P1: p1Count words in chapter 6, ranked 500 and up (halved for the current chapter). P2: p2Count words in chapter 3,
// ranked 3000 and up. P3: p3Count unranked words.
function addPriorityMix(context, { p1Count, p2Count, p3Count }) {
  const p1Names = makeNames('p1', p1Count);
  const p2Names = makeNames('p2', p2Count);
  addWords(context, '6.1', p1Names);
  addWords(context, '3.2', p2Names);
  addWords(context, '3.2', makeNames('p3', p3Count));
  context.priorityService.importFrequencyList([
    ...p1Names.map((dutchText, index) => ({ wordForm: dutchText, frequencyRank: 500 + index })),
    ...p2Names.map((dutchText, index) => ({ wordForm: dutchText, frequencyRank: 3000 + index })),
  ], { shouldReplaceExisting: true });
}

function migrate(context) {
  context.practiceService.migrateToFsrs({ isDryRun: false });
}

// Gives a word a learning card due at dueAtText, as a migrated word would have.
function scheduleWord(context, wordId, dueAtText) {
  const dueAt = Date.parse(dueAtText);
  createPracticeRepository({ database: context.database }).updateWordSchedule(wordId, {
    fsrsCard: serializeCard(buildMigrationCard({ group: 'learning', dueAt, timestamp: dueAt })),
    dueAt,
    introducedOn: '2026-10-01',
    learningStatus: 'learning',
    updatedAt: dueAt,
  });
}

function schedulePhrase(context, phraseId, dueAtText) {
  const dueAt = Date.parse(dueAtText);
  createPhrasePracticeRepository({ database: context.database }).updatePhraseSchedule(phraseId, {
    fsrsCard: serializeCard(buildMigrationCard({ group: 'learning', dueAt, timestamp: dueAt })),
    dueAt,
    introducedOn: '2026-10-01',
    learningStatus: 'learning',
  });
}

function batchIds(batch) {
  return [...batch.reviews, ...batch.new_words].map(word => word.id);
}

function countByPriority(words) {
  return [1, 2, 3].map(priority => words.filter(word => word.priority === priority).length);
}

// Answers every word of the batch in both directions, good until each direction has left the deck, in one session.
function finishSet(context, batch, sessionId) {
  for (const word of [...batch.reviews, ...batch.new_words]) {
    for (const direction of PRACTICE_DIRECTIONS) {
      let result;
      do {
        result = context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId, direction });
      } while (result.deck[direction].in_deck);
    }
  }
}

test('a first set is 10 new words, split 7, 2 and 1 by priority', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 12, p2Count: 5, p3Count: 5 });
  migrate(context);

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.deepEqual(batch.reviews, []);
  assert.equal(batch.new_words.length, 10);
  assert.deepEqual(countByPriority(batch.new_words), [7, 2, 1]);
  assert.equal(batch.counts.set_size, 10);
  assert.equal(batch.counts.set_words, 10);
  assert.equal(batch.counts.is_set_open, false);
});


test('4 reviews due today are the review set; the New words set is 10 New words, never mixed with the reviews', () => {
  const context = createPracticeContext();
  const reviewIds = addWords(context, '6.1', makeNames('oud', 4));
  addWords(context, '6.1', makeNames('nieuw', 20));
  migrate(context);
  reviewIds.forEach((wordId, index) => scheduleWord(context, wordId, `2026-10-2${index}T09:00:00+02:00`));

  const reviewBatch = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });

  assert.deepEqual(reviewBatch.reviews.map(word => word.id), reviewIds, 'most overdue first');
  assert.deepEqual(reviewBatch.new_words, []);
  assert.equal(reviewBatch.counts.kind, 'review');
  assert.equal(reviewBatch.counts.set_words, 4);
  assert.equal(reviewBatch.counts.review_owed, 4);

  const newBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(newBatch.reviews, [], 'the New words set holds no review');
  assert.equal(newBatch.new_words.length, 10);
  assert.equal(newBatch.counts.set_words, 10);
  assert.equal(newBatch.counts.set_new_words, 10);
});


test('15 reviews due: the review set takes the 10 most overdue; the other 5 come in the next review set', () => {
  const context = createPracticeContext();
  const reviewIds = addWords(context, '6.1', makeNames('oud', 15));
  addWords(context, '6.1', makeNames('nieuw', 20));
  migrate(context);
  reviewIds.forEach((wordId, index) => scheduleWord(context, wordId,
    new Date(Date.parse('2026-10-20T09:00:00+02:00') + index * 3600_000).toISOString()));

  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });
  assert.deepEqual(firstSet.reviews.map(word => word.id), reviewIds.slice(0, 10));
  assert.deepEqual(firstSet.new_words, []);
  assert.equal(firstSet.counts.review_owed, 15);

  finishSet(context, firstSet, 's1');
  const nextSet = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });
  assert.deepEqual(nextSet.reviews.map(word => word.id), reviewIds.slice(10));
  assert.deepEqual(nextSet.new_words, [], 'a review set holds no New words');
});

test('a pinned set stays the same words while it is practised: no word joins it, a word added later waits', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 15));
  migrate(context);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const setIds = batchIds(firstBatch);
  for (const word of firstBatch.new_words.slice(0, 3)) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'again', sessionId: 's1' });
  }
  addWords(context, '6.1', ['later-toegevoegd']);

  const sameSession = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const otherSession = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(new Set(batchIds(sameSession)), new Set(setIds));
  assert.equal(sameSession.reviews.length, 3, 'the started words are in the deck now');
  assert.equal(sameSession.new_words.length, 7);
  assert.equal(sameSession.counts.is_set_open, true);
  assert.deepEqual(new Set(batchIds(otherSession)), new Set(setIds), 'a reload keeps the set');
});

test('a finished word leaves the set; the set closes when all are finished and the next one comes the same day', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 25));
  migrate(context);
  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const [firstWord] = firstSet.new_words;
  context.practiceService.gradeWord({ wordId: firstWord.id, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: firstWord.id, grade: 'good', sessionId: 's1' });
  assert.equal(batchIds(context.practiceService.getPracticeBatch({ sessionId: 's1' })).length, 10,
    'learned in uk_nl only: the word still owes nl_uk, so it stays in the set');

  finishSet(context, firstSet, 's1');
  const nextSet = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.equal(nextSet.new_words.length, 10);
  assert.equal(nextSet.counts.is_set_open, false);
  assert.equal(new Set([...batchIds(firstSet), ...batchIds(nextSet)]).size, 20, 'ten other words');
});


test('the next day an unfinished set gives way: its started words and today\'s reviews are the review set; New words start again', () => {
  const context = createPracticeContext();
  const [reviewId] = addWords(context, '6.1', ['oud']);
  addWords(context, '6.1', makeNames('nieuw', 20));
  migrate(context);
  scheduleWord(context, reviewId, '2026-10-30T09:00:00+01:00');
  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 'day1' });
  const startedIds = firstSet.new_words.slice(0, 3).map(word => word.id);
  for (const wordId of startedIds) context.practiceService.gradeWord({ wordId, grade: 'again', sessionId: 'day1' });
  scheduleWord(context, reviewId, '2026-10-25T09:00:00+01:00');

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDayReviews = context.practiceService.getPracticeBatch({ sessionId: 'day2', kind: 'review' });

  assert.deepEqual(new Set(nextDayReviews.reviews.map(word => word.id)), new Set([...startedIds, reviewId]));
  assert.equal(nextDayReviews.new_words.length, 0);
  assert.equal(nextDayReviews.counts.is_set_open, false);
  const nextDayNew = context.practiceService.getPracticeBatch({ sessionId: 'day2' });
  assert.equal(nextDayNew.new_words.length, 10, 'the New words set is not held back by yesterday\'s set');
  assert.equal(nextDayNew.counts.is_set_open, false);
});


test('yesterday 9 wrong and 1 right: today the 10 started words are all still owed as reviews, and the New set is not held back', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 20));
  migrate(context);
  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 'day1' });
  firstSet.new_words.forEach((word, index) => {
    context.practiceService.gradeWord({ wordId: word.id, grade: index === 0 ? 'good' : 'again', sessionId: 'day1' });
  });
  const firstGood = firstSet.new_words[0];
  context.practiceService.gradeWord({ wordId: firstGood.id, grade: 'good', sessionId: 'day1' });

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const reviews = context.practiceService.getPracticeBatch({ sessionId: 'day2', kind: 'review' });

  assert.equal(reviews.reviews.length, 10);
  assert.equal(reviews.new_words.length, 0);
  // The set of today opened after yesterday's answers: every card owes both directions in it, even the learned one.
  const owedFirstGood = reviews.reviews.find(word => word.id === firstGood.id);
  assert.deepEqual(owedFirstGood.directions_left, ['uk_nl', 'nl_uk']);
  const newWords = context.practiceService.getPracticeBatch({ sessionId: 'day2' });
  assert.equal(newWords.new_words.length, 10, 'the New words set starts at once, the started words do not fill it');
  assert.deepEqual(newWords.reviews, []);
});

test('a New word introduced today is not owed as a review until tomorrow; the New words set keeps it open', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 12));
  migrate(context);
  const [word] = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });

  const reviewsToday = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });
  assert.deepEqual(reviewsToday.reviews, []);
  assert.equal(reviewsToday.counts.review_owed, 0);
  const newToday = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.ok(batchIds(newToday).includes(word.id), 'the New words set still holds it');
  const settings = context.practiceSettings.readSettings();
  assert.ok(settings.wordSet.itemIds.includes(word.id));
  assert.equal(settings.reviewSet, null, 'no review set is pinned while no review is owed');

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const reviewsTomorrow = context.practiceService.getPracticeBatch({ sessionId: 's2', kind: 'review' });
  assert.deepEqual(reviewsTomorrow.reviews.map(card => card.id), [word.id]);
  assert.ok(context.practiceSettings.readSettings().reviewSet.itemIds.includes(word.id));
});

test('a word leaves the set only when both directions are answered since it opened; directions_left says what is owed', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 12));
  migrate(context);
  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const [word] = firstSet.new_words;
  assert.deepEqual(word.directions_left, ['uk_nl', 'nl_uk'], 'a new set owes both directions of every card');

  context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1' });
  const ukDone = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.ok(batchIds(ukDone).includes(word.id), 'the nl_uk direction is still owed');
  assert.deepEqual(ukDone.reviews.find(card => card.id === word.id).directions_left, ['nl_uk']);

  context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  const bothDone = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.equal(batchIds(bothDone).includes(word.id), false, 'finished in both directions: it leaves the set');
  assert.equal(bothDone.counts.set_words, 9);
  assert.equal(bothDone.counts.is_set_open, true);
});


test('a card answered in one direction only, and not owed in the other, stays in the review set until answered there', () => {
  const context = createPracticeContext();
  const [reviewId] = addWords(context, '6.1', ['oud']);
  addWords(context, '6.1', makeNames('nieuw', 12));
  migrate(context);
  scheduleWord(context, reviewId, '2026-10-24T09:00:00+02:00');
  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });
  assert.deepEqual(firstSet.reviews.find(card => card.id === reviewId).directions_left, ['uk_nl', 'nl_uk']);

  context.practiceService.gradeWord({ wordId: reviewId, grade: 'good', sessionId: 's1' });
  const afterUk = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });
  assert.deepEqual(afterUk.reviews.find(card => card.id === reviewId).directions_left, ['nl_uk']);
});


test('the round summary counts only the answers given since the set opened', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('nieuw', 20));
  migrate(context);
  const firstSet = context.practiceService.getPracticeBatch({ sessionId: 'day1' });
  const [hardWord] = firstSet.new_words;
  context.practiceService.gradeWord({ wordId: hardWord.id, grade: 'again', sessionId: 'day1' });
  context.practiceService.gradeWord({ wordId: hardWord.id, grade: 'again', sessionId: 'day1' });

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDay = context.practiceService.getPracticeBatch({ sessionId: 'day2', kind: 'review' });
  assert.deepEqual(batchIds(nextDay), [hardWord.id]);
  finishSet(context, nextDay, 'day2');
  const { round } = context.practiceService.getRoundSummary({ kind: 'review' });

  assert.equal(round.total_count, 1);
  assert.equal(round.is_complete, true);
  assert.equal(round.finished_in_session_id, 'day2');
  assert.equal(round.words.find(word => word.id === hardWord.id).mistake_count, 0, 'yesterday\'s mistakes stay out');
});

test('phrases: due phrases fill the set first, new phrases the room left, and the next set follows', () => {
  const context = createPracticeContext();
  const dueIds = makeNames('Oude zin', 12).map(dutchText => context.phraseService.createPhrase({
    nl: dutchText,
    uk: `${dutchText} (переклад)`,
  }).id);
  const newIds = makeNames('Nieuwe zin', 5).map(dutchText => context.phraseService.createPhrase({
    nl: dutchText,
    uk: `${dutchText} (переклад)`,
  }).id);
  migrate(context);
  dueIds.forEach((phraseId, index) => schedulePhrase(context, phraseId,
    new Date(Date.parse('2026-10-20T09:00:00+02:00') + index * 3600_000).toISOString()));

  const firstSet = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(firstSet.reviews.map(phrase => phrase.id), dueIds.slice(0, 10));
  assert.deepEqual(firstSet.new_phrases, []);
  assert.equal(firstSet.counts.set_size, 10);

  context.phrasePracticeService.gradePhrase({ phraseId: dueIds[0], grade: 'again', sessionId: 's1' });
  const pinned = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(pinned.reviews.map(phrase => phrase.id), dueIds.slice(0, 10), 'one direction is not finished');
  assert.deepEqual(pinned.reviews[0].directions_left, ['nl_uk']);
  assert.equal(pinned.counts.is_set_open, true);

  context.phrasePracticeService.gradePhrase({ phraseId: dueIds[0], grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  for (const phraseId of dueIds.slice(1, 10)) {
    for (const direction of PRACTICE_DIRECTIONS) {
      context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1', direction });
    }
  }
  const nextSet = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(nextSet.reviews.map(phrase => phrase.id), dueIds.slice(10));
  assert.deepEqual(nextSet.new_phrases.map(phrase => phrase.id), newIds);
});

test('the set is pinned when the batch is shown: words added before the first answer wait, and are refused', () => {
  const context = createPracticeContext();
  addWords(context, '3.2', makeNames('oud-hoofdstuk', 12));
  migrate(context);
  const shown = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  const laterIds = addWords(context, '6.1', makeNames('hoofdstuk-6', 10));

  const again = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(new Set(batchIds(again)), new Set(batchIds(shown)), 'the P1 words added later do not join');
  assert.throws(
    () => context.practiceService.gradeWord({ wordId: laterIds[0], grade: 'good', sessionId: 's1' }),
    { name: 'ConflictError' },
  );
  finishSet(context, shown, 's1');
  const nextSet = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.ok(nextSet.new_words.some(word => laterIds.includes(word.id)), 'they come in the next set');
});

test('a set saved before the split that mixes reviews and New words: each kind keeps only its own words', () => {
  const context = createPracticeContext();
  const reviewIds = addWords(context, '6.1', makeNames('oud', 3));
  const newIds = addWords(context, '6.1', makeNames('nieuw', 12));
  migrate(context);
  reviewIds.forEach(wordId => scheduleWord(context, wordId, '2026-10-23T09:00:00+02:00'));
  const openedAt = Date.parse(MORNING_IN_AMSTERDAM) - 60_000;
  createPracticeRepository({ database: context.database }).saveSetting('word_set', {
    opened_on: '2026-10-24', opened_at: openedAt, item_ids: [...reviewIds, ...newIds.slice(0, 7)],
  });

  const newBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(newBatch.reviews, [], 'no old word in Нові слова');
  assert.deepEqual(newBatch.new_words.map(word => word.id), newIds.slice(0, 7));

  const reviewBatch = context.practiceService.getPracticeBatch({ sessionId: 's1', kind: 'review' });
  assert.deepEqual(reviewBatch.reviews.map(word => word.id), reviewIds);
  assert.deepEqual(reviewBatch.new_words, []);
});

test('an offline set mixing kinds is pinned with the graded word\'s kind only', () => {
  const context = createPracticeContext();
  const reviewIds = addWords(context, '6.1', makeNames('oud', 2));
  const newIds = addWords(context, '6.1', makeNames('nieuw', 3));
  migrate(context);
  reviewIds.forEach(wordId => scheduleWord(context, wordId, '2026-10-23T09:00:00+02:00'));

  context.practiceService.gradeWord({
    wordId: reviewIds[0], grade: 'good', sessionId: 's1', setWordIds: [...newIds, ...reviewIds],
  });

  const reviewBatch = context.practiceService.getPracticeBatch({ sessionId: 's2', kind: 'review' });
  assert.ok(batchIds(reviewBatch).every(wordId => reviewIds.includes(wordId)), 'no New word in the review set');
  const newBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.deepEqual(newBatch.new_words.map(word => word.id), newIds);
});
