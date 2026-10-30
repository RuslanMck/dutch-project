// Builds the statistics report: word counts by status, expressions, the FSRS states and the words due today, and the
// size of every collection.
import { LEARNING_STATUS_VALUES } from '../../contracts/shared-contracts.js';
import { describeCardState, parseCard } from '../practice/fsrs-scheduling.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from '../practice/practice-calendar.js';
import { findLearnedMoments, summarizeLearningActivity } from './learning-activity.js';

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

  // The learning activity of the period (see learning-activity.js), in the practice time zone.
  function calculateActivity({ period }) {
    const { timeZone } = practiceSettings.readSettings();
    const answers = [
      ...statisticsRepository.listWordAnswers().map(answer => ({ ...answer, kind: 'word' })),
      ...statisticsRepository.listPhraseAnswers().map(answer => ({ ...answer, kind: 'phrase' })),
      ...statisticsRepository.listDrillAnswers().map(answer => ({ ...answer, kind: 'drill' })),
    ];
    return summarizeLearningActivity({
      period,
      now: clock.now(),
      timeZone,
      answers,
      startedWords: statisticsRepository.listStartedWords().map(event => ({ word_id: event.word_id, at: event.at })),
      learnedWords: findLearnedMoments(statisticsRepository.listCountingDeckAnswers()),
      wordsById: new Map(statisticsRepository.listWordNames().map(word => [word.id, word])),
    });
  }

  return Object.freeze({ calculateStatistics, calculateActivity });
}
