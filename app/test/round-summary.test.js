// The round summary shown when the set's words are all learned: answers and mistakes per word and direction, the hardest
// word first, and the time spent with pauses left out. A word is learned when both directions are finished.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyDifficulty, summarizeRound } from '../src/domains/practice/round-summary.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const TEN_SECONDS = 10_000;
const ONE_HOUR = 60 * 60_000;

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return {
    now: () => currentTime,
    advance(milliseconds) {
      currentTime += milliseconds;
    },
  };
}

test('classifyDifficulty: no mistake is easy, one or two is medium, three or more is hard', () => {
  assert.equal(classifyDifficulty(0), 'easy');
  assert.equal(classifyDifficulty(2), 'medium');
  assert.equal(classifyDifficulty(3), 'hard');
});

test('summarizeRound: a later lapse after a direction was finished does not count; no answers gives null', () => {
  const words = [{ id: 1, nl: 'kat', uk: 'кіт', article: 'de', in_deck: false }];
  const answers = [
    { word_id: 1, direction: 'uk_nl', grade: 'good', answered_at: 0, required_correct_after: 2 },
    { word_id: 1, direction: 'uk_nl', grade: 'good', answered_at: 1000, required_correct_after: null },
    { word_id: 1, direction: 'uk_nl', grade: 'again', answered_at: 9_000_000, required_correct_after: 3 },
  ];
  const round = summarizeRound({ words, answers });
  assert.equal(round.words[0].answer_count, 2);
  assert.equal(round.words[0].mistake_count, 0);
  assert.equal(round.finished_at, 1000);
  assert.equal(round.hardest_word_id, null);
  assert.equal(summarizeRound({ words, answers: [] }), null);
});

test('getRoundSummary: all 10 words learned in both directions, the hardest first, and an hour-long pause not counted', () => {
  const clock = createFakeClock(MORNING_IN_AMSTERDAM);
  const context = createTestContext({ clock });
  context.wordService.createWords(Array.from({ length: 12 }, (_, index) => ({
    nl: `woord-${index + 1}`,
    uk: `слово ${index + 1}`,
    section: '6.1',
  })));
  context.practiceService.migrateToFsrs({ isDryRun: false });
  assert.deepEqual(context.practiceService.getRoundSummary(), { round: null });

  const words = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  assert.equal(words.length, 10);
  const [hardestWord, mediumWord, ...easyWords] = words;
  const answer = (wordId, grade, direction = 'uk_nl') => {
    clock.advance(TEN_SECONDS);
    context.practiceService.gradeWord({
      wordId, grade, answer: grade === 'good' ? undefined : 'x', sessionId: 's1', direction,
    });
  };
  answer(hardestWord.id, 'again');
  answer(mediumWord.id, 'hard');
  for (const word of easyWords) answer(word.id, 'good');
  clock.advance(ONE_HOUR);
  answer(hardestWord.id, 'again');
  answer(hardestWord.id, 'again');
  for (const word of easyWords) answer(word.id, 'good');
  for (let repeat = 0; repeat < 5; repeat += 1) answer(hardestWord.id, 'good');
  for (let repeat = 0; repeat < 3; repeat += 1) answer(mediumWord.id, 'good');
  for (const word of words) {
    answer(word.id, 'good', 'nl_uk');
    answer(word.id, 'good', 'nl_uk');
  }

  const { round } = context.practiceService.getRoundSummary();
  assert.equal(round.total_count, 10);
  assert.equal(round.learned_count, 10);
  assert.equal(round.is_complete, true);
  assert.equal(round.hardest_word_id, hardestWord.id);
  assert.deepEqual(round.words.slice(0, 2).map(word => [word.id, word.mistake_count, word.difficulty]),
    [[hardestWord.id, 3, 'hard'], [mediumWord.id, 1, 'medium']]);
  assert.deepEqual(round.words[0].mistakes, { uk_nl: 3, nl_uk: 0 });
  assert.equal(round.words[2].difficulty, 'easy');
  // 28 uk_nl answers and 20 nl_uk answers.
  assert.equal(round.answer_count, 28 + 20);
  // Every answer 10 s after the one before, except one gap of an hour that is left out.
  assert.equal(round.active_seconds, (round.answer_count - 2) * 10);
  assert.equal(round.finished_at - round.started_at, ONE_HOUR + (round.answer_count - 1) * TEN_SECONDS);
});

test('summarizeRound: a word learned and then lapsed still counts as learned, so the round is complete', () => {
  const words = [{ id: 1, nl: 'kat', uk: 'кіт', article: 'de' }, { id: 2, nl: 'hond', uk: 'пес', article: 'de' }];
  const answers = [
    { word_id: 1, session_id: 'day-1', direction: 'uk_nl', grade: 'good', answered_at: 0, required_correct_after: 2 },
    { word_id: 1, session_id: 'day-1', direction: 'uk_nl', grade: 'good', answered_at: 10, required_correct_after: null },
    { word_id: 1, session_id: 'day-1', direction: 'nl_uk', grade: 'good', answered_at: 20, required_correct_after: 2 },
    { word_id: 1, session_id: 'day-1', direction: 'nl_uk', grade: 'good', answered_at: 30, required_correct_after: null },
    { word_id: 2, session_id: 'day-1', direction: 'uk_nl', grade: 'again', answered_at: 40, required_correct_after: 3 },
    { word_id: 1, session_id: 'day-2', direction: 'uk_nl', grade: 'again', answered_at: 100, required_correct_after: 3 },
    { word_id: 2, session_id: 'day-2', direction: 'nl_uk', grade: 'good', answered_at: 110, required_correct_after: 2 },
    { word_id: 2, session_id: 'day-2', direction: 'nl_uk', grade: 'good', answered_at: 120, required_correct_after: 1 },
    { word_id: 2, session_id: 'day-2', direction: 'nl_uk', grade: 'good', answered_at: 130, required_correct_after: null },
    { word_id: 2, session_id: 'day-2', direction: 'uk_nl', grade: 'good', answered_at: 140, required_correct_after: 2 },
    { word_id: 2, session_id: 'day-2', direction: 'uk_nl', grade: 'good', answered_at: 150, required_correct_after: 1 },
    { word_id: 2, session_id: 'day-2', direction: 'uk_nl', grade: 'good', answered_at: 160, required_correct_after: null },
  ];
  const round = summarizeRound({ words, answers });
  assert.equal(round.is_complete, true);
  assert.equal(round.finished_in_session_id, 'day-2');
  assert.equal(round.words[0].id, 2, 'the hardest word first');
  assert.equal(round.words.find(word => word.id === 1).answer_count, 4, 'the lapse after it was learned is left out');
  const unfinished = summarizeRound({ words, answers: answers.slice(0, 5) });
  assert.equal(unfinished.is_complete, false);
  assert.equal(unfinished.finished_in_session_id, null);
});

test('summarizeRound: a word is learned only when both directions are finished, and mistakes are counted per direction', () => {
  const words = [{ id: 1, nl: 'kat', uk: 'кіт', article: 'de' }];
  const answers = [
    { word_id: 1, session_id: 's', direction: 'uk_nl', grade: 'again', answered_at: 0, required_correct_after: 3 },
    { word_id: 1, session_id: 's', direction: 'uk_nl', grade: 'good', answered_at: 10, required_correct_after: 2 },
    { word_id: 1, session_id: 's', direction: 'uk_nl', grade: 'good', answered_at: 20, required_correct_after: null },
    { word_id: 1, session_id: 's', direction: 'nl_uk', grade: 'hard', answered_at: 30, required_correct_after: 3 },
    { word_id: 1, session_id: 's', direction: 'nl_uk', grade: 'good', answered_at: 40, required_correct_after: 2 },
  ];
  const oneDirection = summarizeRound({ words, answers });
  assert.equal(oneDirection.words[0].is_learned, false);
  assert.equal(oneDirection.is_complete, false);
  assert.deepEqual(oneDirection.words[0].mistakes, { uk_nl: 1, nl_uk: 1 });
  assert.equal(oneDirection.words[0].mistake_count, 2);

  const bothDirections = summarizeRound({
    words,
    answers: [...answers, { word_id: 1, session_id: 's', direction: 'nl_uk', grade: 'good', answered_at: 50, required_correct_after: null }],
  });
  assert.equal(bothDirections.words[0].is_learned, true);
  assert.equal(bothDirections.is_complete, true);
  assert.equal(bothDirections.finished_in_session_id, 's');
});

test('summarizeRound: the time spent counts the other answers mixed in between the round\'s', () => {
  const words = [{ id: 1, nl: 'kat', uk: 'кіт', article: 'de' }];
  const answers = [
    { word_id: 1, session_id: 's', direction: 'uk_nl', grade: 'good', answered_at: 0, required_correct_after: 2 },
    { word_id: 1, session_id: 's', direction: 'uk_nl', grade: 'good', answered_at: 400_000, required_correct_after: null },
  ];
  assert.equal(summarizeRound({ words, answers }).active_seconds, 0);
  const answerTimes = [0, 100_000, 200_000, 300_000, 400_000];
  assert.equal(summarizeRound({ words, answers, answerTimes }).active_seconds, 400);
});
