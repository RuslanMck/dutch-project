// The learning deck: the pure rules, and the deck through grading with a fake clock (Ruslan's examples: a clean word
// needs 2 right answers in a row, each mistake adds one up to 6, every answer counts, and the deck's free slots decide
// how many new words come).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyAnswerToDeck, countTimesLeft, replayDeckAnswers } from '../src/domains/practice/learning-deck.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const NEXT_MORNING_IN_AMSTERDAM = '2026-10-25T09:00:00+01:00';

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

test('a clean new word needs 2 right answers in a row', () => {
  const first = applyAnswerToDeck({ deckPosition: null, grade: 'good', isFirstAnswerEver: true });
  assert.deepEqual(first.deckPosition, { requiredCorrect: 2, correctStreak: 1 });
  assert.equal(countTimesLeft(first.deckPosition), 1);
  const second = applyAnswerToDeck({ deckPosition: first.deckPosition, grade: 'good', isFirstAnswerEver: false });
  assert.equal(second.deckPosition, null);
  assert.equal(second.hasLearned, true);
});

test('each mistake (again or hard) adds one right answer, up to 6, and resets the streak', () => {
  const wrongFirst = applyAnswerToDeck({ deckPosition: null, grade: 'again', isFirstAnswerEver: true });
  assert.deepEqual(wrongFirst.deckPosition, { requiredCorrect: 3, correctStreak: 0 });
  const right = applyAnswerToDeck({ deckPosition: wrongFirst.deckPosition, grade: 'good', isFirstAnswerEver: false });
  assert.equal(countTimesLeft(right.deckPosition), 2);
  const hard = applyAnswerToDeck({ deckPosition: right.deckPosition, grade: 'hard', isFirstAnswerEver: false });
  assert.deepEqual(hard.deckPosition, { requiredCorrect: 4, correctStreak: 0 });
  const capped = replayDeckAnswers([
    { grade: 'again', isFirstAnswerEver: true },
    ...Array.from({ length: 8 }, () => ({ grade: 'again', isFirstAnswerEver: false })),
  ]);
  assert.deepEqual(capped, { requiredCorrect: 6, correctStreak: 0 });
});

test('a learned word answered right stays out; answered wrong it comes back with 3 times left', () => {
  assert.equal(applyAnswerToDeck({ deckPosition: null, grade: 'good', isFirstAnswerEver: false }).deckPosition, null);
  const lapse = applyAnswerToDeck({ deckPosition: null, grade: 'hard', isFirstAnswerEver: false });
  assert.equal(lapse.hasEnteredDeck, true);
  assert.equal(countTimesLeft(lapse.deckPosition), 3);
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

  assert.equal(nextDay.reviews.length, 10, 'the 9 missed words and the 1 right once are all in the deck');
  assert.equal(nextDay.new_words.length, 0);
  assert.equal(nextDay.counts.deck_size, 10);
  assert.equal(nextDay.counts.deck_free_slots, 0);
  assert.deepEqual(nextDay.reviews.map(word => word.deck.times_left).sort(), [1, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
});

test('every answer counts: a word missed and repeated in the session moves toward learned', () => {
  const { context, wordIds: [wordId] } = createMigratedContext(1);
  const missed = context.practiceService.gradeWord({ wordId, grade: 'again', answer: 'x', sessionId: 's1' });
  assert.equal(missed.deck.times_left, 3);
  const firstRepeat = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's1' });
  assert.equal(firstRepeat.is_repeat, true);
  assert.equal(firstRepeat.deck.times_left, 2);
  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  assert.equal(context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's2' }).deck.times_left, 1);
  const learned = context.practiceService.gradeWord({ wordId, grade: 'good', sessionId: 's2' });
  assert.equal(learned.deck.has_learned, true);
  assert.equal(learned.deck.in_deck, false);
  assert.ok(learned.next_due_on > '2026-10-26', 'a learned word follows its FSRS due date');
  assert.equal(context.practiceService.calculatePracticeStatistics().deck_size, 0);
});

test('words learned the next day free their slots: the free slots fill with new words once a day', () => {
  const { context } = createMigratedContext(20);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 'day-1' });
  for (const word of firstBatch.new_words) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 'day-1' });
  }
  assert.equal(context.practiceService.getPracticeBatch({ sessionId: 'day-1' }).new_words.length, 0);

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDay = context.practiceService.getPracticeBatch({ sessionId: 'day-2' });
  assert.equal(nextDay.new_words.length, 0, 'the deck is full until its words are learned');
  for (const word of nextDay.reviews.slice(0, 3)) {
    context.practiceService.gradeWord({ wordId: word.id, grade: 'good', sessionId: 'day-2' });
  }

  const afterLearning = context.practiceService.getPracticeBatch({ sessionId: 'day-2' });
  assert.equal(afterLearning.counts.deck_size, 7);
  assert.equal(afterLearning.new_words.length, 3, 'the 3 learned words leave 3 slots');
});

test('the deck rebuild replays the counting review logs; a dry run writes nothing', () => {
  const { context, wordIds: [cleanId, missedId] } = createMigratedContext(2);
  context.practiceService.gradeWord({ wordId: cleanId, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: missedId, grade: 'again', answer: 'x', sessionId: 's1' });
  context.database.prepare('UPDATE words SET deck_required_correct = NULL, deck_correct_streak = 0').run();

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
    .prepare('SELECT id, deck_required_correct, deck_correct_streak FROM words ORDER BY id')
    .all();
  assert.deepEqual(positions, [
    { id: cleanId, deck_required_correct: 2, deck_correct_streak: 1 },
    { id: missedId, deck_required_correct: 3, deck_correct_streak: 0 },
  ]);
});
