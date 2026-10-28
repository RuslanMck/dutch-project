// The learning deck: the pure rules, and the deck through grading with a fake clock. Ruslan's rules: a clean word needs
// 2 right answers in the session, each mistake adds one up to 6 and keeps the right answers given, every answer counts,
// the session lasts across days until its words are learned, and only then do the next new words come. Each word has a
// deck per direction (uk_nl and nl_uk): the first answer ever puts it in both.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyAnswerToDeck,
  applyAnswerToDecks,
  countTimesLeft,
  describeDeckPositions,
  readDeckPositions,
  readReverseDeckPosition,
  replayDeckAnswers,
} from '../src/domains/practice/learning-deck.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const NEXT_MORNING_IN_AMSTERDAM = '2026-10-25T09:00:00+01:00';
const NOT_IN_DECK = Object.freeze({ uk_nl: null, nl_uk: null });

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return {
    now: () => currentTime,
    moveTo(isoText) {
      currentTime = Date.parse(isoText);
    },
  };
}

function createMigratedContext(wordCount) {
  const context = createTestContext({ clock: createFakeClock(MORNING_IN_AMSTERDAM) });
  const wordIds = context.wordService.createWords(Array.from({ length: wordCount }, (_, index) => ({
    nl: `woord-${index + 1}`,
    uk: `слово ${index + 1}`,
    section: '6.1',
  }))).added.map(word => word.id);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return { context, wordIds };
}

// Answers a word in one direction, good until that direction has left the deck (once, when it is not in it).
function answerDirectionUntilLeft(context, wordId, direction, sessionId) {
  let result;
  do {
    result = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId, direction });
  } while (result.deck[direction].in_deck);
  return result;
}

// Finishes a word in both directions in one session.
function finishWord(context, wordId, sessionId) {
  answerDirectionUntilLeft(context, wordId, 'uk_nl', sessionId);
  return answerDirectionUntilLeft(context, wordId, 'nl_uk', sessionId);
}

test('a clean new word needs 2 right answers', () => {
  const first = applyAnswerToDeck({ deckPosition: null, grade: 'good', isFirstAnswerEver: true });
  assert.deepEqual(first.deckPosition, { requiredCorrect: 2, correctCount: 1, isLapse: false });
  assert.equal(countTimesLeft(first.deckPosition), 1);
  const second = applyAnswerToDeck({ deckPosition: first.deckPosition, grade: 'good', isFirstAnswerEver: false });
  assert.equal(second.deckPosition, null);
  assert.equal(second.hasLearned, true);
});

test('each mistake (again or hard) adds one right answer, up to 6, and keeps the right answers given', () => {
  const wrongFirst = applyAnswerToDeck({ deckPosition: null, grade: 'again', isFirstAnswerEver: true });
  assert.deepEqual(wrongFirst.deckPosition, { requiredCorrect: 3, correctCount: 0, isLapse: false });
  const right = applyAnswerToDeck({ deckPosition: wrongFirst.deckPosition, grade: 'good', isFirstAnswerEver: false });
  assert.equal(countTimesLeft(right.deckPosition), 2);
  const hard = applyAnswerToDeck({ deckPosition: right.deckPosition, grade: 'hard', isFirstAnswerEver: false });
  assert.deepEqual(hard.deckPosition, { requiredCorrect: 4, correctCount: 1, isLapse: false });
  assert.equal(countTimesLeft(hard.deckPosition), 3);
  const capped = replayDeckAnswers([
    { grade: 'again', isFirstAnswerEver: true },
    ...Array.from({ length: 8 }, () => ({ grade: 'again', isFirstAnswerEver: false })),
  ]);
  assert.deepEqual(capped, { requiredCorrect: 6, correctCount: 0, isLapse: false });
});

test('a learned word answered right stays out; answered wrong it comes back with 3 times left', () => {
  assert.equal(applyAnswerToDeck({ deckPosition: null, grade: 'good', isFirstAnswerEver: false }).deckPosition, null);
  const lapse = applyAnswerToDeck({ deckPosition: null, grade: 'hard', isFirstAnswerEver: false });
  assert.equal(lapse.hasEnteredDeck, true);
  assert.equal(lapse.deckPosition.isLapse, true);
  assert.equal(countTimesLeft(lapse.deckPosition), 3);
});

test('the first answer ever puts both directions in the deck: the answered one with the answer, the other at 2 to go', () => {
  const first = applyAnswerToDecks({ deckPositions: NOT_IN_DECK, direction: 'uk_nl', grade: 'good', isFirstAnswerEver: true });

  assert.deepEqual(first.deckPositions, {
    uk_nl: { requiredCorrect: 2, correctCount: 1, isLapse: false },
    nl_uk: { requiredCorrect: 2, correctCount: 0, isLapse: false },
  });
  assert.equal(first.hasEnteredDeck, true);
  assert.equal(first.hasLearnedDirection, false);
  assert.equal(first.hasLearned, false);
});

test('the first answer ever in nl_uk enters both directions too, with a mistake adding one to the answered one', () => {
  const first = applyAnswerToDecks({ deckPositions: NOT_IN_DECK, direction: 'nl_uk', grade: 'again', isFirstAnswerEver: true });

  assert.deepEqual(first.deckPositions, {
    uk_nl: { requiredCorrect: 2, correctCount: 0, isLapse: false },
    nl_uk: { requiredCorrect: 3, correctCount: 0, isLapse: false },
  });
});

test('a direction leaves its deck; the word is learned only when the other direction is out too', () => {
  const ukLast = applyAnswerToDecks({
    deckPositions: { uk_nl: { requiredCorrect: 2, correctCount: 1, isLapse: false }, nl_uk: { requiredCorrect: 2, correctCount: 0, isLapse: false } },
    direction: 'uk_nl',
    grade: 'good',
    isFirstAnswerEver: false,
  });
  assert.equal(ukLast.deckPositions.uk_nl, null);
  assert.equal(ukLast.hasLearnedDirection, true);
  assert.equal(ukLast.hasLearned, false, 'nl_uk is still in the deck');
  assert.equal(ukLast.deckPositions.nl_uk.correctCount, 0, 'the other direction is untouched');

  const nlLast = applyAnswerToDecks({
    deckPositions: { uk_nl: null, nl_uk: { requiredCorrect: 2, correctCount: 1, isLapse: false } },
    direction: 'nl_uk',
    grade: 'good',
    isFirstAnswerEver: false,
  });
  assert.equal(nlLast.hasLearned, true);
  assert.deepEqual(nlLast.deckPositions, { uk_nl: null, nl_uk: null });
});

test('a mistake outside the deck is a lapse into that direction only; a right answer outside it stays outside', () => {
  const lapse = applyAnswerToDecks({ deckPositions: NOT_IN_DECK, direction: 'nl_uk', grade: 'hard', isFirstAnswerEver: false });
  assert.deepEqual(lapse.deckPositions, {
    uk_nl: null,
    nl_uk: { requiredCorrect: 3, correctCount: 0, isLapse: true },
  });
  assert.equal(lapse.hasEnteredDeck, true);

  const right = applyAnswerToDecks({ deckPositions: NOT_IN_DECK, direction: 'uk_nl', grade: 'good', isFirstAnswerEver: false });
  assert.deepEqual(right.deckPositions, NOT_IN_DECK);
  assert.equal(right.hasLearnedDirection, false);
  assert.equal(right.hasLearned, false);
});

test('readDeckPositions reads the uk_nl columns and the deck_reverse columns of a word row', () => {
  const wordRow = {
    deck_required_correct: 2,
    deck_correct_count: 1,
    deck_entered_by_lapse: 0,
    deck_reverse_required_correct: 4,
    deck_reverse_correct_count: 2,
    deck_reverse_entered_by_lapse: 1,
  };
  assert.deepEqual(readDeckPositions(wordRow), {
    uk_nl: { requiredCorrect: 2, correctCount: 1, isLapse: false },
    nl_uk: { requiredCorrect: 4, correctCount: 2, isLapse: true },
  });
  assert.deepEqual(readReverseDeckPosition({ ...wordRow, deck_reverse_required_correct: null }), null);
});

test('describeDeckPositions: in_deck when either direction is, times_left summed, each direction described', () => {
  const described = describeDeckPositions({
    uk_nl: { requiredCorrect: 2, correctCount: 1, isLapse: false },
    nl_uk: { requiredCorrect: 3, correctCount: 0, isLapse: false },
  });
  assert.deepEqual(described, {
    in_deck: true,
    times_left: 4,
    uk_nl: { in_deck: true, required_correct: 2, correct_count: 1, times_left: 1 },
    nl_uk: { in_deck: true, required_correct: 3, correct_count: 0, times_left: 3 },
  });
  assert.equal(describeDeckPositions(NOT_IN_DECK).in_deck, false);
  assert.equal(describeDeckPositions(NOT_IN_DECK).times_left, 0);
});

test('yesterday 9 wrong and 1 right: today the 10 deck words come back and no new word joins', () => {
  const { context } = createMigratedContext(30);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 'day-1' });
  assert.equal(firstBatch.new_words.length, 10);
  firstBatch.new_words.forEach((word, index) => context.practiceService.gradeWord({
    wordId: word.id, grade: index === 0 ? 'good' : 'again', answer: 'x', sessionId: 'day-1',
  }));

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDay = context.practiceService.getPracticeBatch({ sessionId: 'day-2' });

  assert.equal(nextDay.reviews.length, 10, 'the session goes on: all 10 words are owed in both directions');
  assert.equal(nextDay.new_words.length, 0);
  assert.equal(nextDay.counts.deck_words, 10);
  assert.deepEqual(nextDay.reviews.map(word => word.deck.uk_nl.times_left).sort(), [1, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
});

test('every answer counts: a word missed and repeated in the session moves toward learned, direction by direction', () => {
  const { context, wordIds: [wordId] } = createMigratedContext(1);
  const missed = context.practiceService.gradeWord({ wordId, grade: 'again', answer: 'x', sessionId: 's1' });
  assert.equal(missed.deck.uk_nl.times_left, 3);
  const firstRepeat = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });
  assert.equal(firstRepeat.is_repeat, true);
  assert.equal(firstRepeat.deck.uk_nl.times_left, 2);
  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  assert.equal(context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's2' }).deck.uk_nl.times_left, 1);
  const ukLearned = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's2' });
  assert.equal(ukLearned.deck.uk_nl.in_deck, false);
  assert.equal(ukLearned.deck.has_learned, false, 'nl_uk is still in the deck');
  assert.equal(ukLearned.deck.has_learned_direction, true);

  const nlFirst = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's2', direction: 'nl_uk' });
  assert.equal(nlFirst.is_repeat, false, 'the first answer in the other direction of the session');
  const nlLearned = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's2', direction: 'nl_uk' });
  assert.equal(nlLearned.deck.has_learned, true);
  assert.equal(nlLearned.deck.in_deck, false);
  assert.ok(nlLearned.next_due_on > '2026-10-26', 'a learned word follows its FSRS due date');
  assert.equal(context.practiceService.calculatePracticeStatistics().deck_size, 0);
});

test('the set lasts until all its words are learned in both directions; then the next 10 new words come at once', () => {
  const { context } = createMigratedContext(25);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 'day-1' });
  for (const word of firstBatch.new_words) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 'day-1' });
  }

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDay = context.practiceService.getPracticeBatch({ sessionId: 'day-2' });
  assert.equal(nextDay.reviews.length, 10, 'the session\'s words come back the next day, progress kept');
  assert.equal(nextDay.new_words.length, 0);
  for (const word of nextDay.reviews.slice(0, 9)) finishWord(context, word.id, 'day-2');
  const oneLeft = context.practiceService.getPracticeBatch({ sessionId: 'day-2' });
  assert.equal(oneLeft.reviews.length, 1, 'only the word not learned yet');
  assert.equal(oneLeft.new_words.length, 0, 'no new words while a word of the session is not learned');

  finishWord(context, nextDay.reviews[9].id, 'day-2');
  const nextSession = context.practiceService.getPracticeBatch({ sessionId: 'day-2' });
  assert.equal(nextSession.counts.deck_words, 0);
  assert.equal(nextSession.new_words.length, 10, 'the next session starts at once, the same day');
});

test('a review answered wrong stays in its set until learned; the new words come in the next set', () => {
  const { context, wordIds } = createMigratedContext(12);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  for (const word of firstBatch.new_words) finishWord(context, word.id, 's1');
  context.clock.moveTo('2026-11-20T09:00:00+01:00');
  const later = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.equal(later.reviews.length, 10, 'learned words are due again: the set is 10 reviews');
  context.practiceService.gradeWord({ wordId: later.reviews[0].id, grade: 'again', answer: 'x', sessionId: 's2' });

  for (const word of later.reviews.slice(1)) finishWord(context, word.id, 's2');

  const afterLapse = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.equal(afterLapse.reviews[0].id, later.reviews[0].id, 'the lapse is in the session');
  assert.equal(afterLapse.reviews[0].deck.uk_nl.times_left, 3);
  assert.equal(afterLapse.reviews.length, 1, 'the other reviews are finished');
  assert.equal(afterLapse.new_words.length, 0, 'the set was full of reviews');
  for (let answer = 0; answer < 3; answer += 1) {
    context.practiceService.gradeWord({ wordId: later.reviews[0].id, grade: 'good', sessionId: 's2' });
  }
  // The set opened today is still owed nl_uk for the lapsed word: it is answered too, then the set closes.
  context.practiceService.gradeWord({ wordId: later.reviews[0].id, grade: 'good', sessionId: 's2', direction: 'nl_uk' });
  const nextSet = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.equal(nextSet.new_words.length, wordIds.length - 10, 'the next set has room for the new words');
});

test('the deck rebuild replays the counting uk_nl review logs; a dry run writes nothing', () => {
  const { context, wordIds: [cleanId, missedId] } = createMigratedContext(2);
  context.practiceService.gradeWord({ wordId: cleanId, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: missedId, grade: 'again', answer: 'x', sessionId: 's1' });
  context.database.prepare(`
    UPDATE words
    SET deck_required_correct = NULL, deck_correct_count = 0, deck_reverse_required_correct = NULL,
      deck_reverse_correct_count = 0
  `).run();

  const dryRun = context.practiceService.rebuildLearningDeck();
  assert.equal(dryRun.deck_size, 2);
  assert.equal(context.practiceService.calculatePracticeStatistics().deck_size, 0, 'a dry run writes nothing');

  // A deck word with a long FSRS due date still comes back the day after its last answer.
  context.database.prepare('UPDATE words SET due_at = ? WHERE id = ?')
    .run(Date.parse('2026-11-30T00:00:00+01:00'), cleanId);
  context.practiceService.rebuildLearningDeck({ isDryRun: false });
  assert.equal(context.database.prepare('SELECT due_at FROM words WHERE id = ?').pluck().get(cleanId),
    Date.parse('2026-10-25T00:00:00+02:00'));
  const positions = context.database
    .prepare('SELECT id, deck_required_correct, deck_correct_count FROM words ORDER BY id')
    .all();
  assert.deepEqual(positions, [
    { id: cleanId, deck_required_correct: 2, deck_correct_count: 1 },
    { id: missedId, deck_required_correct: 3, deck_correct_count: 0 },
  ]);
});
