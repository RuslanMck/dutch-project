// Read-only counting queries across the collections, for the statistics report. No business rules.
export function createStatisticsRepository({ database }) {
  const selectWordCountsByStatusStatement = database.prepare(`
    SELECT status, COUNT(*) AS word_count
    FROM words
    GROUP BY status
  `);
  const selectCountStatementByName = Object.freeze({
    words: database.prepare('SELECT COUNT(*) FROM words').pluck(),
    expressions: database.prepare("SELECT COUNT(*) FROM words WHERE kind = 'expression'").pluck(),
    rules: database.prepare('SELECT COUNT(*) FROM rules').pluck(),
    mistakePatterns: database.prepare('SELECT COUNT(*) FROM mistake_patterns').pluck(),
    mistakeCases: database.prepare('SELECT COUNT(*) FROM mistake_cases').pluck(),
    phrases: database.prepare('SELECT COUNT(*) FROM phrases').pluck(),
    texts: database.prepare('SELECT COUNT(*) FROM texts').pluck(),
  });
  const selectSectionCodesStatement = database.prepare('SELECT code FROM sections ORDER BY code').pluck();

  function listWordCountsByStatus() {
    return selectWordCountsByStatusStatement.all();
  }

  // name: one of words, expressions, rules, mistakePatterns, mistakeCases, phrases, texts.
  function countRows(name) {
    return selectCountStatementByName[name].get();
  }

  function listSectionCodes() {
    return selectSectionCodesStatement.all();
  }

  return Object.freeze({ listWordCountsByStatus, countRows, listSectionCodes });
}
