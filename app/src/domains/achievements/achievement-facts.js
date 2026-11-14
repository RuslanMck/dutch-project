// The numbers the achievements count, computed from the rows of one repository read. Pure: the caller passes the rows,
// the instant, the time zone and the daily goal. Calendar days are in the practice time zone, as the statistics are.
import { findHourInTimeZone, formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';
import { calculateStreak, findLearnedMoments } from '../statistics/learning-activity.js';

const MILLISECONDS_PER_DAY = 86_400_000;
const PERFECT_SET_MINIMUM_ANSWERS = 5;
const EARLY_HOUR_BEFORE = 8;
const NIGHT_HOUR_FROM = 23;
const COMEBACK_GAP_DAYS = 3;
const SATURDAY = 6;

// words: [{ status, category }]; activityAnswers: [{ kind: 'word' | 'phrase' | 'drill', answered_at }];
// deckAnswers: the counting deck answers (findLearnedMoments input); deckSessionAnswers: [{ session_id, grade }];
// orderAnswers and ruleAnswers: [{ is_correct, answered_at }] in order.
export function calculateAchievementFacts({
  now, timeZone, dailyGoal, words, activityAnswers, deckAnswers, deckSessionAnswers, orderAnswers, ruleAnswers,
}) {
  const answerCountByDate = countByCalendarDate(activityAnswers.map(answer => answer.answered_at), timeZone);
  const practisedDates = [...answerCountByDate.keys()].sort();
  const streak = calculateStreak(activityAnswers, formatCalendarDateInTimeZone(now, timeZone), timeZone);
  const learnedMoments = findLearnedMoments(deckAnswers);

  return {
    learned_words: words.filter(word => word.status === 'learned').length,
    category_words: countLearnedWordsByCategory(words),
    answers: activityAnswers.length,
    days_practised: practisedDates.length,
    longest_streak: streak.longest,
    perfect_sets: countPerfectSets(deckSessionAnswers),
    most_words_learned_in_day: maximumCount(countByCalendarDate(learnedMoments.map(moment => moment.at), timeZone)),
    order_correct: countCorrect(orderAnswers),
    order_run: longestCorrectRun(orderAnswers),
    rules_correct: countCorrect(ruleAnswers),
    rules_run: longestCorrectRun(ruleAnswers),
    drill_answers: activityAnswers.filter(answer => answer.kind === 'drill').length,
    early_answers: countAnswersAtHour(activityAnswers, timeZone, hour => hour < EARLY_HOUR_BEFORE),
    night_answers: countAnswersAtHour(activityAnswers, timeZone, hour => hour >= NIGHT_HOUR_FROM),
    weekends: countWeekendsWithSaturdayAndSunday(practisedDates),
    comebacks: countComebacks(practisedDates),
    goal_days: [...answerCountByDate.values()].filter(count => count >= dailyGoal).length,
  };
}

function countAnswersAtHour(answers, timeZone, isMatchingHour) {
  return answers.filter(answer => isMatchingHour(findHourInTimeZone(answer.answered_at, timeZone))).length;
}

function countByCalendarDate(timestamps, timeZone) {
  const countByDate = new Map();
  for (const timestamp of timestamps) {
    const date = formatCalendarDateInTimeZone(timestamp, timeZone);
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }
  return countByDate;
}

function maximumCount(countByDate) {
  return Math.max(0, ...countByDate.values());
}

function countLearnedWordsByCategory(words) {
  const countByCategory = {};
  for (const word of words) {
    if (word.status !== 'learned' || !word.category) continue;
    countByCategory[word.category] = (countByCategory[word.category] ?? 0) + 1;
  }
  return countByCategory;
}

// A perfect set: a deck session with at least five counting answers, every one of them good.
function countPerfectSets(deckSessionAnswers) {
  const gradesBySession = new Map();
  for (const { session_id: sessionId, grade } of deckSessionAnswers) {
    if (!gradesBySession.has(sessionId)) gradesBySession.set(sessionId, []);
    gradesBySession.get(sessionId).push(grade);
  }
  return [...gradesBySession.values()]
    .filter(grades => grades.length >= PERFECT_SET_MINIMUM_ANSWERS && grades.every(grade => grade === 'good'))
    .length;
}

function countCorrect(answers) {
  return answers.filter(answer => answer.is_correct === 1).length;
}

function longestCorrectRun(answers) {
  let longest = 0;
  let current = 0;
  for (const answer of answers) {
    current = answer.is_correct === 1 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

// Saturdays with the Sunday after them practised too. Dates are calendar dates, so UTC arithmetic is enough.
function countWeekendsWithSaturdayAndSunday(practisedDates) {
  const practised = new Set(practisedDates);
  return practisedDates.filter(date => {
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    return dayOfWeek === SATURDAY && practised.has(addOneDay(date));
  }).length;
}

// Returns to practice after a gap of at least COMEBACK_GAP_DAYS days without any answer.
function countComebacks(practisedDates) {
  let comebacks = 0;
  for (let index = 1; index < practisedDates.length; index += 1) {
    const daysWithoutAnswers = countDaysBetween(practisedDates[index - 1], practisedDates[index]) - 1;
    if (daysWithoutAnswers >= COMEBACK_GAP_DAYS) comebacks += 1;
  }
  return comebacks;
}

function addOneDay(calendarDate) {
  return new Date(Date.parse(`${calendarDate}T00:00:00Z`) + MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

function countDaysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / MILLISECONDS_PER_DAY);
}
