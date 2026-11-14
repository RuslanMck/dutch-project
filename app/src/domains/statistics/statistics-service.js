// Builds the statistics report: word counts by status, expressions, the FSRS states and the words due today, and the
// size of every collection. Also the activity of a period, the calendar of answers, the week recap and the daily goal.
import { LEARNING_STATUS_VALUES } from '../../contracts/shared-contracts.js';
import { describeCardState, parseCard } from '../practice/fsrs-scheduling.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';
import {
  countAnswersByDay,
  findLearnedMoments,
  summarizeLearningActivity,
  summarizeWeek,
} from './learning-activity.js';

export function createStatisticsService({ statisticsRepository, practiceSettings, clock }) {
  function calculateStatistics() {
    const wordCountByStatus = Object.fromEntries(LEARNING_STATUS_VALUES.map(learningStatus => [learningStatus, 0]));
    for (const { status, word_count: wordCount } of statisticsRepository.listWordCountsByStatus()) {
      wordCountByStatus[status] = wordCount;
    }
    return {
      words: {
        total: statisticsRepository.countRows('words'),
        new: wordCountByStatus.new,
        learning: wordCountByStatus.learning,
        learned: wordCountByStatus.learned,
        expressions: statisticsRepository.countRows('expressions'),
      },
      fsrs: calculateFsrsCounts(),
      rules: statisticsRepository.countRows('rules'),
      patterns: statisticsRepository.countRows('mistakePatterns'),
      cases: statisticsRepository.countRows('mistakeCases'),
      phrases: statisticsRepository.countRows('phrases'),
      texts: statisticsRepository.countRows('texts'),
      sections: statisticsRepository.listSectionCodes(),
    };
  }

  // States come from each card (no card = new). due_today counts the words due before the start of tomorrow in the
  // practice time zone, so overdue words count too.
  function calculateFsrsCounts() {
    const { timeZone } = practiceSettings.readSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), timeZone);
    const tomorrowStartTimestamp = findStartOfDay(addDaysToCalendarDate(today, 1), timeZone);
    const fsrsCounts = { new: 0, learning: 0, review: 0, relearning: 0, due_today: 0 };
    for (const { fsrs_card: fsrsCard, due_at: dueAt } of statisticsRepository.listWordSchedules()) {
      fsrsCounts[describeCardState(parseCard(fsrsCard))] += 1;
      if (dueAt !== null && dueAt < tomorrowStartTimestamp) fsrsCounts.due_today += 1;
    }
    return fsrsCounts;
  }

  // Every answer that counts for the statistics: words, phrases and drills, each with its kind.
  function listActivityAnswers() {
    return [
      ...statisticsRepository.listWordAnswers().map(answer => ({ ...answer, kind: 'word' })),
      ...statisticsRepository.listPhraseAnswers().map(answer => ({ ...answer, kind: 'phrase' })),
      ...statisticsRepository.listDrillAnswers().map(answer => ({ ...answer, kind: 'drill' })),
    ];
  }

  // Everything the learning activity and the week recap read besides the clock and the time zone.
  function readActivitySources() {
    return {
      answers: listActivityAnswers(),
      startedWords: statisticsRepository.listStartedWords().map(event => ({ word_id: event.word_id, at: event.at })),
      learnedWords: findLearnedMoments(statisticsRepository.listCountingDeckAnswers()),
      wordsById: new Map(statisticsRepository.listWordNames().map(word => [word.id, word])),
    };
  }

  // The learning activity of the period (see learning-activity.js), in the practice time zone.
  function calculateActivity({ period }) {
    const { timeZone } = practiceSettings.readSettings();
    return summarizeLearningActivity({ period, now: clock.now(), timeZone, ...readActivitySources() });
  }

  // One entry per calendar day of the last `days` days, today last, in the practice time zone; days without answers
  // have 0. correct counts the answers graded good.
  function calculateCalendar({ days }) {
    const { timeZone } = practiceSettings.readSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), timeZone);
    const countsByDate = countAnswersByDay(listActivityAnswers(), timeZone);
    const firstDate = addDaysToCalendarDate(today, 1 - days);
    const calendarDays = Array.from({ length: days }, (_, index) => {
      const date = addDaysToCalendarDate(firstDate, index);
      const counts = countsByDate.get(date);
      return { date, answers: counts?.answers ?? 0, correct: counts?.correct ?? 0 };
    });
    return { days: calendarDays };
  }

  // The recap of the current or the previous calendar week (see summarizeWeek in learning-activity.js).
  function calculateWeek({ week }) {
    const { timeZone } = practiceSettings.readSettings();
    return summarizeWeek({ week, now: clock.now(), timeZone, ...readActivitySources() });
  }

  // The daily goal and today's answers (the answers that count for the statistics, in the practice time zone).
  function calculateDailyGoal() {
    const { timeZone, dailyGoal } = practiceSettings.readSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), timeZone);
    const todayCounts = countAnswersByDay(listActivityAnswers(), timeZone).get(today);
    return { goal: dailyGoal, today: { date: today, answers: todayCounts?.answers ?? 0 } };
  }

  // goal: an integer the contract has checked.
  function saveDailyGoal({ goal }) {
    practiceSettings.saveDailyGoal(goal);
    return calculateDailyGoal();
  }

  return Object.freeze({
    calculateStatistics,
    calculateActivity,
    calculateCalendar,
    calculateWeek,
    calculateDailyGoal,
    saveDailyGoal,
  });
}
