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
  const selectWordSchedulesStatement = database.prepare('SELECT fsrs_card, due_at FROM words');

  // Every word answer, resets included (they are history): each answer since the learning deck from deck_answers, and
  // the first answers from before it from review_logs (those with no deck answer of their own).
  const selectWordAnswersStatement = database.prepare(`
    SELECT deck_answers.word_id AS item_id, deck_answers.grade, deck_answers.answered_at
    FROM deck_answers
    UNION ALL
    SELECT review_logs.word_id AS item_id, review_logs.grade, review_logs.reviewed_at AS answered_at
    FROM review_logs
    WHERE NOT EXISTS (
      SELECT 1
      FROM deck_answers
      WHERE deck_answers.word_id = review_logs.word_id AND deck_answers.session_id = review_logs.session_id
        AND deck_answers.is_first_in_session = 1
    )
  `);
  const selectPhraseAnswersStatement = database.prepare(`
    SELECT phrase_review_logs.phrase_id AS item_id, phrase_review_logs.grade,
      phrase_review_logs.reviewed_at AS answered_at
    FROM phrase_review_logs
  `);
  // The first answer of each word that was New, since the last reset: when it was started.
  const selectStartedWordsStatement = database.prepare(`
    SELECT review_logs.word_id, review_logs.reviewed_at AS at
    FROM review_logs
    WHERE review_logs.card_before IS NULL AND review_logs.superseded_at IS NULL
  `);
  const selectCountingDeckAnswersStatement = database.prepare(`
    SELECT deck_answers.word_id, deck_answers.answered_at, deck_answers.required_correct_after
    FROM deck_answers
    WHERE deck_answers.superseded_at IS NULL
  `);
  const selectWordNamesStatement = database.prepare('SELECT words.id, words.nl, words.uk, words.article FROM words');

  function listWordAnswers() {
    return selectWordAnswersStatement.all();
  }

  function listPhraseAnswers() {
    return selectPhraseAnswersStatement.all();
  }

  function listStartedWords() {
    return selectStartedWordsStatement.all();
  }

  function listCountingDeckAnswers() {
    return selectCountingDeckAnswersStatement.all();
  }

  function listWordNames() {
    return selectWordNamesStatement.all();
  }

  function listWordCountsByStatus() {
    return selectWordCountsByStatusStatement.all();
  }

  // One row per word: its FSRS card as JSON (NULL = New) and its due time (NULL = New).
  function listWordSchedules() {
    return selectWordSchedulesStatement.all();
  }

  // name: one of words, expressions, rules, mistakePatterns, mistakeCases, phrases, texts.
  function countRows(name) {
    return selectCountStatementByName[name].get();
  }

  function listSectionCodes() {
    return selectSectionCodesStatement.all();
  }

  return Object.freeze({
    listWordCountsByStatus,
    listWordSchedules,
    countRows,
    listSectionCodes,
    listWordAnswers,
    listPhraseAnswers,
    listStartedWords,
    listCountingDeckAnswers,
    listWordNames,
  });
}
