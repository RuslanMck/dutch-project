// SQL for the achievements: one read of every fact source (words and their categories, the activity answers, the deck
// answers by session, word-order and rule-exercise answers, and the daily goal). The activity answers and the counting
// deck answers come from the statistics repository, so the achievements and the statistics count the same answers.
// No business rules.
const DEFAULT_DAILY_GOAL = 20;

export function createAchievementRepository({ database, statisticsRepository }) {
  const selectWordStatusesStatement = database.prepare('SELECT status, category FROM words');
  const selectDeckSessionAnswersStatement = database.prepare(`
    SELECT session_id, grade
    FROM deck_answers
    WHERE superseded_at IS NULL
  `);
  const selectOrderAnswersStatement = database.prepare(`
    SELECT is_correct, answered_at
    FROM order_sentence_answers
    ORDER BY answered_at, id
  `);
  const selectRuleAnswersStatement = database.prepare(`
    SELECT is_correct, answered_at
    FROM rule_exercise_answers
    ORDER BY answered_at, id
  `);
  const selectDailyGoalSettingStatement = database.prepare(
    "SELECT value FROM practice_settings WHERE name = 'daily_goal'",
  ).pluck();

  // The activity answers as the statistics list them: word (deck and review logs), phrase and drill answers.
  function readFactSources() {
    const activityAnswers = [
      ...statisticsRepository.listWordAnswers().map(answer => ({ ...answer, kind: 'word' })),
      ...statisticsRepository.listPhraseAnswers().map(answer => ({ ...answer, kind: 'phrase' })),
      ...statisticsRepository.listDrillAnswers().map(answer => ({ ...answer, kind: 'drill' })),
    ];
    return {
      words: selectWordStatusesStatement.all(),
      activityAnswers,
      deckAnswers: statisticsRepository.listCountingDeckAnswers(),
      deckSessionAnswers: selectDeckSessionAnswersStatement.all(),
      orderAnswers: selectOrderAnswersStatement.all(),
      ruleAnswers: selectRuleAnswersStatement.all(),
      dailyGoal: readDailyGoal(),
    };
  }

  // The stored goal is JSON; without one the goal is the default.
  function readDailyGoal() {
    const storedValue = selectDailyGoalSettingStatement.get();
    return storedValue === undefined ? DEFAULT_DAILY_GOAL : JSON.parse(storedValue);
  }

  return Object.freeze({ readFactSources });
}
