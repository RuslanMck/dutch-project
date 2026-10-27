// The learning activity of a period (day, week, month, year, all time): answers, accuracy, time spent, days
// practised, words started and learned, a chart of answers per hour, day or month, the hardest words, and the streak
// of days in a row. Pure: the caller passes the rows, the instant and the time zone.
import { ACTIVITY_PERIODS } from '../../contracts/statistics-contracts.js';
import {
  addDaysToCalendarDate,
  findHourInTimeZone,
  findStartOfDay,
  formatCalendarDateInTimeZone,
} from '../practice/practice-calendar.js';

export { ACTIVITY_PERIODS };

// A gap longer than this between two answers is a pause and is not counted as time spent.
export const PAUSE_AFTER_MILLISECONDS = 5 * 60_000;
const HARDEST_WORD_LIMIT = 5;
const WEEK_DAY_COUNT = 7;
const MONTH_DAY_COUNT = 30;
const YEAR_MONTH_COUNT = 12;
const HOURS_PER_DAY = 24;

// answers: [{ kind: 'word' | 'phrase', item_id, grade, answered_at }], any order. startedWords and learnedWords:
// [{ word_id, at }]. wordsById: Map of id → { nl, uk, article } for the hardest words.
export function summarizeLearningActivity({ period, now, timeZone, answers, startedWords, learnedWords, wordsById }) {
  const sortedAnswers = attachActiveTime([...answers].sort((left, right) => left.answered_at - right.answered_at));
  const today = formatCalendarDateInTimeZone(now, timeZone);
  const range = resolvePeriodRange({ period, today, timeZone, firstAnswerAt: sortedAnswers[0]?.answered_at ?? now });
  const isInRange = (timestamp, { start, end }) => timestamp >= start && timestamp < end;
  const answersInRange = sortedAnswers.filter(answer => isInRange(answer.answered_at, range));

  const summarizeRange = rangeToCount => summarizeTotals({
    answers: sortedAnswers.filter(answer => isInRange(answer.answered_at, rangeToCount)),
    startedCount: startedWords.filter(event => isInRange(event.at, rangeToCount)).length,
    learnedCount: learnedWords.filter(event => isInRange(event.at, rangeToCount)).length,
    timeZone,
  });

  return {
    period,
    from_date: range.fromDate,
    to_date: range.toDate,
    totals: summarizeRange(range),
    previous_totals: range.previous ? summarizeRange(range.previous) : null,
    chart: buildChart({ range, answers: answersInRange, timeZone }),
    hardest_words: findHardestWords(answersInRange, wordsById),
    streak: calculateStreak(sortedAnswers, today, timeZone),
  };
}

// Each answer gets active_milliseconds: the gap since the answer before it, or 0 when that gap was a pause.
function attachActiveTime(sortedAnswers) {
  return sortedAnswers.map((answer, index) => {
    const gap = index === 0 ? Infinity : answer.answered_at - sortedAnswers[index - 1].answered_at;
    return { ...answer, active_milliseconds: gap <= PAUSE_AFTER_MILLISECONDS ? gap : 0 };
  });
}

// { start, end } in milliseconds (end excluded), the calendar dates shown, the bucket unit of the chart, and the
// period just before it (none for all time).
export function resolvePeriodRange({ period, today, timeZone, firstAnswerAt }) {
  const tomorrow = addDaysToCalendarDate(today, 1);
  const dayRange = (fromDate, dayCount) => ({
    start: findStartOfDay(fromDate, timeZone),
    end: findStartOfDay(addDaysToCalendarDate(fromDate, dayCount), timeZone),
  });
  if (period === 'day') {
    return {
      ...dayRange(today, 1), fromDate: today, toDate: today, unit: 'hour',
      previous: dayRange(addDaysToCalendarDate(today, -1), 1),
    };
  }
  if (period === 'week' || period === 'month') {
    const dayCount = period === 'week' ? WEEK_DAY_COUNT : MONTH_DAY_COUNT;
    const fromDate = addDaysToCalendarDate(today, 1 - dayCount);
    return {
      ...dayRange(fromDate, dayCount), fromDate, toDate: today, unit: 'day',
      previous: dayRange(addDaysToCalendarDate(fromDate, -dayCount), dayCount),
    };
  }
  const currentMonthStartDate = `${today.slice(0, 7)}-01`;
  const end = findStartOfDay(tomorrow, timeZone);
  if (period === 'year') {
    const fromDate = addMonthsToMonthStart(currentMonthStartDate, 1 - YEAR_MONTH_COUNT);
    const previousFromDate = addMonthsToMonthStart(fromDate, -YEAR_MONTH_COUNT);
    return {
      start: findStartOfDay(fromDate, timeZone), end, fromDate, toDate: today, unit: 'month',
      previous: { start: findStartOfDay(previousFromDate, timeZone), end: findStartOfDay(fromDate, timeZone) },
    };
  }
  const firstDate = formatCalendarDateInTimeZone(Math.min(firstAnswerAt, end - 1), timeZone);
  const fromDate = `${firstDate.slice(0, 7)}-01`;
  return { start: findStartOfDay(fromDate, timeZone), end, fromDate, toDate: today, unit: 'month', previous: null };
}

function addMonthsToMonthStart(monthStartDate, monthCount) {
  const [year, month] = monthStartDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + monthCount, 1)).toISOString().slice(0, 10);
}

function summarizeTotals({ answers, startedCount, learnedCount, timeZone }) {
  const goodCount = answers.filter(answer => answer.grade === 'good').length;
  const activeMilliseconds = answers.reduce((total, answer) => total + answer.active_milliseconds, 0);
  return {
    answers: answers.length,
    word_answers: answers.filter(answer => answer.kind === 'word').length,
    phrase_answers: answers.filter(answer => answer.kind === 'phrase').length,
    mistakes: answers.length - goodCount,
    accuracy: answers.length ? goodCount / answers.length : null,
    active_seconds: Math.round(activeMilliseconds / 1000),
    days_practised: new Set(answers.map(answer => formatCalendarDateInTimeZone(answer.answered_at, timeZone))).size,
    new_words: startedCount,
    learned_words: learnedCount,
  };
}

// One bar per hour (day), per day (week, month) or per month (year, all time), empty ones included, in order.
function buildChart({ range, answers, timeZone }) {
  const keys = listBucketKeys(range);
  const bucketByKey = new Map(keys.map(key => [key, { key, answers: 0, mistakes: 0, active_seconds: 0 }]));
  for (const answer of answers) {
    const bucket = bucketByKey.get(findBucketKey(answer.answered_at, range.unit, timeZone));
    if (!bucket) continue;
    bucket.answers += 1;
    if (answer.grade !== 'good') bucket.mistakes += 1;
    bucket.active_seconds += answer.active_milliseconds / 1000;
  }
  const buckets = [...bucketByKey.values()].map(bucket => ({
    ...bucket,
    active_seconds: Math.round(bucket.active_seconds),
  }));
  return { unit: range.unit, buckets };
}

function listBucketKeys(range) {
  if (range.unit === 'hour') return Array.from({ length: HOURS_PER_DAY }, (_, hour) => String(hour));
  if (range.unit === 'day') {
    const keys = [];
    for (let date = range.fromDate; date <= range.toDate; date = addDaysToCalendarDate(date, 1)) keys.push(date);
    return keys;
  }
  const keys = [];
  const lastMonth = range.toDate.slice(0, 7);
  for (let monthStart = range.fromDate; monthStart.slice(0, 7) <= lastMonth;
    monthStart = addMonthsToMonthStart(monthStart, 1)) {
    keys.push(monthStart.slice(0, 7));
  }
  return keys;
}

function findBucketKey(timestamp, unit, timeZone) {
  if (unit === 'hour') return String(findHourInTimeZone(timestamp, timeZone));
  const date = formatCalendarDateInTimeZone(timestamp, timeZone);
  return unit === 'day' ? date : date.slice(0, 7);
}

// The words with the most mistakes in the period (at least one), then the most answers.
function findHardestWords(answers, wordsById) {
  const statsByWordId = new Map();
  for (const answer of answers) {
    if (answer.kind !== 'word' || !wordsById.has(answer.item_id)) continue;
    const stats = statsByWordId.get(answer.item_id) ?? { answers: 0, mistakes: 0 };
    stats.answers += 1;
    if (answer.grade !== 'good') stats.mistakes += 1;
    statsByWordId.set(answer.item_id, stats);
  }
  return [...statsByWordId.entries()]
    .filter(([, stats]) => stats.mistakes > 0)
    .sort(([, left], [, right]) => right.mistakes - left.mistakes || right.answers - left.answers)
    .slice(0, HARDEST_WORD_LIMIT)
    .map(([wordId, stats]) => {
      const word = wordsById.get(wordId);
      return { id: wordId, nl: word.nl, uk: word.uk, article: word.article, ...stats };
    });
}

// Days in a row with at least one answer: current counts back from today, or from yesterday while today has none yet.
export function calculateStreak(answers, today, timeZone) {
  const practisedDates = new Set(answers.map(answer => formatCalendarDateInTimeZone(answer.answered_at, timeZone)));
  let current = 0;
  let date = practisedDates.has(today) ? today : addDaysToCalendarDate(today, -1);
  while (practisedDates.has(date)) {
    current += 1;
    date = addDaysToCalendarDate(date, -1);
  }
  let longest = 0;
  for (const practisedDate of practisedDates) {
    if (practisedDates.has(addDaysToCalendarDate(practisedDate, -1))) continue;
    let length = 0;
    for (let streakDate = practisedDate; practisedDates.has(streakDate);
      streakDate = addDaysToCalendarDate(streakDate, 1)) {
      length += 1;
    }
    longest = Math.max(longest, length);
  }
  return { current, longest, is_today_practised: practisedDates.has(today) };
}

// Learned moments from a word's deck answers, oldest first: an answer that left the deck (required_correct_after
// null) right after one that was in it. deckAnswers: [{ word_id, answered_at, required_correct_after }].
export function findLearnedMoments(deckAnswers) {
  const wasInDeckByWordId = new Map();
  const learnedWords = [];
  for (const answer of [...deckAnswers].sort((left, right) => left.answered_at - right.answered_at)) {
    const isInDeck = answer.required_correct_after !== null;
    if (!isInDeck && wasInDeckByWordId.get(answer.word_id)) {
      learnedWords.push({ word_id: answer.word_id, at: answer.answered_at });
    }
    wasInDeckByWordId.set(answer.word_id, isInDeck);
  }
  return learnedWords;
}
