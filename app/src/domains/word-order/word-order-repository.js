// SQL for the word-order exercise: sentences, their answers and the vocabulary the distractors come from.
// No business rules: the service decides what is valid, what is a repeat and what the set holds.
const LATEST_ANSWER_SQL = `
  WITH latest_answers AS (
    SELECT sentence_id, answered_at, is_correct,
      ROW_NUMBER() OVER (PARTITION BY sentence_id ORDER BY answered_at DESC, id DESC) AS recency
    FROM order_sentence_answers
  )
`;
// A rule filter: all sentences (isAllRules = 1) or those whose rule name (COALESCE(rule, 'none')) is in rulesJson.
const RULE_FILTER_SQL = "(@isAllRules = 1 OR COALESCE(rule, 'none') IN (SELECT value FROM json_each(@rulesJson)))";

export function createWordOrderRepository({ database }) {
  const insertSentenceStatement = database.prepare(`
    INSERT INTO order_sentences (nl, uk, rule, source, nl_key, added_at, structure, alt_orders)
    VALUES (@nl, @uk, @rule, @source, @nlKey, @addedAt, @structure, @altOrders)
    ON CONFLICT(nl_key) DO NOTHING
  `);
  const selectSentenceByIdStatement = database.prepare(`
    SELECT id, nl, uk, rule, source, added_at, structure, alt_orders FROM order_sentences WHERE id = @sentenceId
  `);
  const selectSentenceByNlKeyStatement = database.prepare(`
    SELECT id, nl, uk, rule, source, added_at, structure, alt_orders FROM order_sentences WHERE nl_key = @nlKey
  `);
  const updateSentenceStatement = database.prepare(`
    UPDATE order_sentences SET uk = @uk, rule = @rule, structure = @structure, alt_orders = @altOrders
    WHERE id = @sentenceId
  `);
  const deleteSentenceStatement = database.prepare('DELETE FROM order_sentences WHERE id = @sentenceId');
  const selectSentencesNewestFirstStatement = database.prepare(`
    SELECT s.id, s.nl, s.uk, s.rule, s.source, s.added_at, s.structure, s.alt_orders,
      COALESCE(totals.times_answered, 0) AS times_answered,
      COALESCE(totals.times_correct, 0) AS times_correct,
      totals.last_answered_at
    FROM order_sentences s
    LEFT JOIN (
      SELECT sentence_id, COUNT(*) AS times_answered, SUM(is_correct) AS times_correct,
        MAX(answered_at) AS last_answered_at
      FROM order_sentence_answers
      GROUP BY sentence_id
    ) totals ON totals.sentence_id = s.id
    ORDER BY s.added_at DESC, s.id DESC
  `);
  // queue_group: 0 = the last answer was wrong (most recent first), 1 = never answered (oldest added first),
  // 2 = the rest (least recently answered first). Ties are broken at random.
  const selectSentencesForSetStatement = database.prepare(`
    ${LATEST_ANSWER_SQL},
    sentence_queue AS (
      SELECT s.id, s.nl, s.uk, s.rule, s.alt_orders, s.added_at, latest.answered_at AS last_answered_at,
        CASE
          WHEN latest.is_correct = 0 THEN 0
          WHEN latest.answered_at IS NULL THEN 1
          ELSE 2
        END AS queue_group
      FROM order_sentences s
      LEFT JOIN latest_answers latest ON latest.sentence_id = s.id AND latest.recency = 1
    )
    SELECT id, nl, uk, rule, alt_orders FROM sentence_queue
    WHERE ${RULE_FILTER_SQL}
    ORDER BY queue_group,
      CASE queue_group
        WHEN 0 THEN -last_answered_at
        WHEN 1 THEN added_at
        ELSE last_answered_at
      END,
      random()
    LIMIT @limit
  `);
  const countSentencesStatement = database.prepare(`
    SELECT COUNT(*) AS total FROM order_sentences WHERE ${RULE_FILTER_SQL}
  `);
  const countSentencesByRuleStatement = database.prepare(`
    SELECT COALESCE(rule, 'none') AS rule_name, COUNT(*) AS total FROM order_sentences GROUP BY rule_name
  `);
  const selectVocabularyStatement = database.prepare('SELECT nl, status FROM words ORDER BY nl');
  const insertAnswerStatement = database.prepare(`
    INSERT INTO order_sentence_answers (sentence_id, answered_at, is_correct, answer)
    VALUES (@sentenceId, @answeredAt, @isCorrect, @answer)
  `);

  // Returns the new sentence's id, or null when a sentence with the same nl_key is already stored.
  // structure is the JSON text of the schema, or null; altOrders the JSON text of the alternative orders.
  function insertSentence({ nl, uk, rule, source, nlKey, addedAt, structure, altOrders }) {
    const insertResult = insertSentenceStatement.run({ nl, uk, rule, source, nlKey, addedAt, structure, altOrders });
    return insertResult.changes === 0 ? null : Number(insertResult.lastInsertRowid);
  }

  function findSentenceById(sentenceId) {
    return selectSentenceByIdStatement.get({ sentenceId }) ?? null;
  }

  function findSentenceByNlKey(nlKey) {
    return selectSentenceByNlKeyStatement.get({ nlKey }) ?? null;
  }

  // uk, rule, structure (JSON text or null) and altOrders (JSON text) are written whole.
  function updateSentence({ sentenceId, uk, rule, structure, altOrders }) {
    updateSentenceStatement.run({ sentenceId, uk, rule, structure, altOrders });
  }

  function deleteSentence(sentenceId) {
    deleteSentenceStatement.run({ sentenceId });
  }

  function listSentencesNewestFirst() {
    return selectSentencesNewestFirstStatement.all();
  }

  // rules: null for every sentence, else the rule names (and 'none') to keep; an empty array keeps none.
  function listSentencesForSet({ limit, rules }) {
    return selectSentencesForSetStatement.all({ limit, ...ruleFilterParameters(rules) });
  }

  function countSentences({ rules = null } = {}) {
    return countSentencesStatement.get(ruleFilterParameters(rules)).total;
  }

  // Each rule name ('none' included) with its number of sentences; names with no sentence are not returned.
  function countSentencesByRule() {
    return countSentencesByRuleStatement.all();
  }

  function listVocabulary() {
    return selectVocabularyStatement.all();
  }

  function createAnswer({ sentenceId, answeredAt, isCorrect, answer }) {
    insertAnswerStatement.run({ sentenceId, answeredAt, isCorrect: isCorrect ? 1 : 0, answer });
  }

  return Object.freeze({
    insertSentence,
    findSentenceById,
    findSentenceByNlKey,
    updateSentence,
    deleteSentence,
    listSentencesNewestFirst,
    listSentencesForSet,
    countSentences,
    countSentencesByRule,
    listVocabulary,
    createAnswer,
  });
}

function ruleFilterParameters(rules) {
  return { isAllRules: rules === null ? 1 : 0, rulesJson: JSON.stringify(rules ?? []) };
}
