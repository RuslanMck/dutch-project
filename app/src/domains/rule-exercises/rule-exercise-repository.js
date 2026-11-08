// SQL for rule exercises and their answers. No business rules: the service decides what a set holds and what is right.
const EXERCISE_COLUMNS = `e.id, e.rule_id, r.code AS rule_code, r.title AS rule_title, e.kind, e.question, e.sentence,
  e.hint, e.translation, e.answer, e.accepted_answers, e.options, e.explanation, e.created_at`;
const LATEST_ANSWER_SQL = `
  latest_answers AS (
    SELECT exercise_id, answered_at, is_correct,
      ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY answered_at DESC, id DESC) AS recency
    FROM rule_exercise_answers
  )`;
const RULE_FILTER_SQL = 'e.rule_id IN (SELECT value FROM json_each(@ruleIdsJson))';

export function createRuleExerciseRepository({ database }) {
  const insertExerciseStatement = database.prepare(`
    INSERT INTO rule_exercises (rule_id, kind, question, sentence, hint, translation, answer, accepted_answers, options,
      explanation, sentence_key, source, created_at)
    VALUES (@ruleId, @kind, @question, @sentence, @hint, @translation, @answer, @acceptedAnswers, @options,
      @explanation, @sentenceKey, @source, @createdAt)
    ON CONFLICT(sentence_key) DO NOTHING
  `);
  const selectExerciseByIdStatement = database.prepare(`
    SELECT ${EXERCISE_COLUMNS} FROM rule_exercises e JOIN rules r ON r.id = e.rule_id WHERE e.id = @exerciseId
  `);
  // Never answered, oldest first.
  const selectUnansweredStatement = database.prepare(`
    SELECT ${EXERCISE_COLUMNS} FROM rule_exercises e JOIN rules r ON r.id = e.rule_id
    WHERE ${RULE_FILTER_SQL} AND NOT EXISTS (SELECT 1 FROM rule_exercise_answers a WHERE a.exercise_id = e.id)
    ORDER BY e.created_at, e.id
  `);
  // The last answer was wrong and is older than @answeredBefore; the oldest mistakes first.
  const selectLastWrongStatement = database.prepare(`
    WITH ${LATEST_ANSWER_SQL}
    SELECT ${EXERCISE_COLUMNS} FROM rule_exercises e JOIN rules r ON r.id = e.rule_id
    JOIN latest_answers l ON l.exercise_id = e.id AND l.recency = 1
    WHERE ${RULE_FILTER_SQL} AND l.is_correct = 0 AND l.answered_at < @answeredBefore
    ORDER BY l.answered_at
    LIMIT @limit
  `);
  const selectExistingSentencesStatement = database.prepare(`
    SELECT r.code AS rule_code, e.sentence, e.answer FROM rule_exercises e JOIN rules r ON r.id = e.rule_id
    WHERE ${RULE_FILTER_SQL} ORDER BY e.created_at DESC, e.id DESC LIMIT @limit
  `);
  const selectRuleTotalsStatement = database.prepare(`
    WITH ${LATEST_ANSWER_SQL}
    SELECT e.rule_id,
      COUNT(*) AS exercise_count,
      SUM(CASE WHEN l.exercise_id IS NULL THEN 1 ELSE 0 END) AS unanswered_count,
      (SELECT COUNT(*) FROM rule_exercise_answers a JOIN rule_exercises x ON x.id = a.exercise_id
        WHERE x.rule_id = e.rule_id) AS answer_count,
      (SELECT COALESCE(SUM(a.is_correct), 0) FROM rule_exercise_answers a JOIN rule_exercises x ON x.id = a.exercise_id
        WHERE x.rule_id = e.rule_id) AS correct_count
    FROM rule_exercises e
    LEFT JOIN latest_answers l ON l.exercise_id = e.id AND l.recency = 1
    GROUP BY e.rule_id
  `);
  const selectVocabularyStatement = database.prepare('SELECT nl, status FROM words ORDER BY nl');
  const insertAnswerStatement = database.prepare(`
    INSERT INTO rule_exercise_answers (exercise_id, answer, is_correct, answered_at)
    VALUES (@exerciseId, @answer, @isCorrect, @answeredAt)
  `);

  // Returns true when the exercise was saved, false when the same sentence and answer already exist.
  function insertExercise(exercise) {
    return insertExerciseStatement.run(exercise).changes === 1;
  }

  return Object.freeze({
    insertExercise,
    findExerciseById: exerciseId => selectExerciseByIdStatement.get({ exerciseId }),
    listUnanswered: ruleIds => selectUnansweredStatement.all({ ruleIdsJson: JSON.stringify(ruleIds) }),
    listLastWrong: ({ ruleIds, answeredBefore, limit }) => selectLastWrongStatement.all({
      ruleIdsJson: JSON.stringify(ruleIds), answeredBefore, limit,
    }),
    listExistingSentences: ({ ruleIds, limit }) => selectExistingSentencesStatement.all({
      ruleIdsJson: JSON.stringify(ruleIds), limit,
    }),
    listRuleTotals: () => selectRuleTotalsStatement.all(),
    listVocabulary: () => selectVocabularyStatement.all(),
    createAnswer: ({ exerciseId, answer, isCorrect, answeredAt }) => insertAnswerStatement.run({
      exerciseId, answer, isCorrect: isCorrect ? 1 : 0, answeredAt,
    }),
  });
}
