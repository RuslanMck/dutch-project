// The statistics page's learning activity: periods and their charts in the practice time zone, totals with time
// spent (pauses left out), the hardest words, the streak, and the learned moments from deck answers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateStreak,
  findLearnedMoments,
  resolvePeriodRange,
  summarizeLearningActivity,
} from '../src/domains/statistics/learning-activity.js';
import { createTestContext } from './database-test-helpers.js';

const TIME_ZONE = 'Europe/Amsterdam';
const NOW = Date.parse('2026-10-27T18:00:00+01:00');
const at = isoText => Date.parse(isoText);
const wordsById = new Map([[1, { nl: 'kat', uk: 'кіт', article: 'de' }], [2, { nl: 'laten', uk: 'залишати', article: null }]]);

function summarize(period, answers, extra = {}) {
  return summarizeLearningActivity({
    period, now: NOW, timeZone: TIME_ZONE, answers, startedWords: [], learnedWords: [], wordsById, ...extra,
  });
}

test('resolvePeriodRange: day, the last 7 and 30 days, the last 12 months, and all time from the first answer', () => {
  const today = '2026-10-27';
  const day = resolvePeriodRange({ period: 'day', today, timeZone: TIME_ZONE, firstAnswerAt: NOW });
  assert.equal(day.start, at('2026-10-27T00:00:00+01:00'));
  assert.equal(day.previous.start, at('2026-10-26T00:00:00+01:00'));
  const week = resolvePeriodRange({ period: 'week', today, timeZone: TIME_ZONE, firstAnswerAt: NOW });
  assert.deepEqual([week.fromDate, week.toDate, week.unit], ['2026-10-21', '2026-10-27', 'day']);
  const month = resolvePeriodRange({ period: 'month', today, timeZone: TIME_ZONE, firstAnswerAt: NOW });
  assert.equal(month.fromDate, '2026-09-28');
  const year = resolvePeriodRange({ period: 'year', today, timeZone: TIME_ZONE, firstAnswerAt: NOW });
  assert.deepEqual([year.fromDate, year.unit], ['2025-11-01', 'month']);
  assert.equal(year.previous.start, at('2024-11-01T00:00:00+01:00'));
  assert.equal(year.previous.end, at('2025-10-28T00:00:00+01:00'));
  const all = resolvePeriodRange({ period: 'all', today, timeZone: TIME_ZONE, firstAnswerAt: at('2026-08-15T10:00:00+02:00') });
  assert.deepEqual([all.fromDate, all.previous], ['2026-08-01', null]);
});

test('totals: answers, accuracy, time without pauses, days, and the previous period for comparison', () => {
  const answers = [
    { kind: 'word', item_id: 1, grade: 'good', answered_at: at('2026-10-27T10:00:00+01:00') },
    { kind: 'word', item_id: 2, grade: 'again', answered_at: at('2026-10-27T10:00:30+01:00') },
    { kind: 'phrase', item_id: 9, grade: 'good', answered_at: at('2026-10-27T10:01:30+01:00') },
    { kind: 'word', item_id: 2, grade: 'good', answered_at: at('2026-10-27T15:00:00+01:00') },
    { kind: 'word', item_id: 1, grade: 'good', answered_at: at('2026-10-26T09:00:00+01:00') },
  ];
  const day = summarize('day', answers);
  assert.deepEqual(day.totals, {
    answers: 4, word_answers: 3, phrase_answers: 1, mistakes: 1, accuracy: 0.75, active_seconds: 90,
    days_practised: 1, new_words: 0, learned_words: 0,
  });
  assert.equal(day.previous_totals.answers, 1);
  assert.equal(day.chart.unit, 'hour');
  assert.equal(day.chart.buckets.length, 24);
  assert.deepEqual(day.chart.buckets[10], { key: '10', answers: 3, mistakes: 1, active_seconds: 90 });
  assert.deepEqual(day.hardest_words, [{ id: 2, nl: 'laten', uk: 'залишати', article: null, answers: 2, mistakes: 1 }]);

  const week = summarize('week', answers);
  assert.equal(week.chart.buckets.length, 7);
  assert.equal(week.totals.days_practised, 2);
  assert.equal(week.chart.buckets.at(-1).key, '2026-10-27');
  assert.equal(summarize('all', answers).previous_totals, null);
});

test('summarize with no answers: zeros, accuracy null, and an empty chart for the period', () => {
  const month = summarize('month', []);
  assert.equal(month.totals.answers, 0);
  assert.equal(month.totals.accuracy, null);
  assert.equal(month.chart.buckets.length, 30);
  assert.deepEqual(month.streak, { current: 0, longest: 0, is_today_practised: false });
});

test('calculateStreak: counts back from yesterday while today has no answer yet, and keeps the longest run', () => {
  const answersOn = dates => dates.map(date => ({ answered_at: at(`${date}T12:00:00+01:00`) }));
  assert.deepEqual(calculateStreak(answersOn(['2026-10-26', '2026-10-25', '2026-10-20', '2026-10-19', '2026-10-18',
    '2026-10-17']), '2026-10-27', TIME_ZONE), { current: 2, longest: 4, is_today_practised: false });
  assert.equal(calculateStreak(answersOn(['2026-10-27', '2026-10-26']), '2026-10-27', TIME_ZONE).current, 2);
  assert.equal(calculateStreak(answersOn(['2026-10-25']), '2026-10-27', TIME_ZONE).current, 0);
});

test('findLearnedMoments: a word leaving the deck is learned; a review answered right outside the deck is not', () => {
  const deckAnswers = [
    { word_id: 1, answered_at: 1, required_correct_after: 2 },
    { word_id: 1, answered_at: 2, required_correct_after: null },
    { word_id: 1, answered_at: 3, required_correct_after: null },
    { word_id: 2, answered_at: 4, required_correct_after: null },
    { word_id: 1, answered_at: 5, required_correct_after: 3 },
    { word_id: 1, answered_at: 6, required_correct_after: null },
  ];
  assert.deepEqual(findLearnedMoments(deckAnswers), [{ word_id: 1, at: 2 }]);
});

test('calculateActivity reads the answers, started and learned words from the database', () => {
  let currentTime = Date.parse('2026-10-24T12:00:00+02:00');
  const clock = { now: () => currentTime };
  const context = createTestContext({ clock });
  context.wordService.createWords([{ nl: 'kat', uk: 'кіт', section: '6.1' }, { nl: 'hond', uk: 'пес', section: '6.1' }]);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  const [kat] = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  context.practiceService.gradeWord({ wordId: kat.id, grade: 'good', sessionId: 's1' });
  currentTime += 20_000;
  context.practiceService.gradeWord({ wordId: kat.id, grade: 'good', sessionId: 's1' });
  const activity = context.statisticsService.calculateActivity({ period: 'day' });
  assert.equal(activity.totals.answers, 2);
  assert.equal(activity.totals.active_seconds, 20);
  assert.equal(activity.totals.new_words, 1);
  assert.equal(activity.totals.learned_words, 1);
  assert.deepEqual(activity.streak, { current: 1, longest: 1, is_today_practised: true });
});
