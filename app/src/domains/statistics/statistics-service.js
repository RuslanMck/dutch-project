// Builds the statistics report: word counts by status, expressions, and the size of every collection.
import { LEARNING_STATUS_VALUES } from '../../contracts/shared-contracts.js';

export function createStatisticsService({ statisticsRepository }) {
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
      rules: statisticsRepository.countRows('rules'),
      patterns: statisticsRepository.countRows('mistakePatterns'),
      cases: statisticsRepository.countRows('mistakeCases'),
      phrases: statisticsRepository.countRows('phrases'),
      texts: statisticsRepository.countRows('texts'),
      sections: statisticsRepository.listSectionCodes(),
    };
  }

  return Object.freeze({ calculateStatistics });
}
