// Builds the statistics report: word counts by status, expressions, the FSRS states and the words due today, and the
// size of every collection.
import { LEARNING_STATUS_VALUES } from '../../contracts/shared-contracts.js';
import { describeCardState, parseCard } from '../practice/fsrs-scheduling.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';

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

  return Object.freeze({ calculateStatistics });
}
