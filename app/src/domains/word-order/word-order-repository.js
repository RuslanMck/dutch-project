// SQL for the word-order exercise: sentences, their answers and the vocabulary the distractors come from.
// No business rules: the service decides what is valid, what is a repeat and what the set holds.
const LATEST_ANSWER_SQL = `
  WITH latest_answers AS (
    SELECT sentence_id, answered_at, is_correct,
      ROW_NUMBER() OVER (PARTITION BY sentence_id ORDER BY answered_at DESC, id DESC) AS recency
    FROM order_sentence_answers
  )
`;

export function createWordOrderRepository({ database }) {
  const insertSentenceStatement = database.prepare(`
    INSERT INTO order_sentences (nl, uk, rule, source, nl_key, added_at)
    VALUES (@nl, @uk, @rule, @source, @nlKey, @addedAt)
    ON CONFLICT(nl_key) DO NOTHING
  `);
  const selectSentenceByIdStatement = database.prepare(`
    SELECT id, nl, uk, rule, source, added_at FROM order_sentences WHERE id = @sentenceId
  `);
  const deleteSentenceStatement = database.prepare('DELETE FROM order_sentences WHERE id = @sentenceId');
  const selectSentencesNewestFirstStatement = database.prepare(`
    SELECT s.id, s.nl, s.uk, s.rule, s.source, s.added_at,
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
      SELECT s.id, s.nl, s.uk, s.rule, s.added_at, latest.answered_at AS last_answered_at,
        CASE
          WHEN latest.is_correct = 0 THEN 0
          WHEN latest.answered_at IS NULL THEN 1
          ELSE 2
        END AS queue_group
      FROM order_sentences s
      LEFT JOIN latest_answers latest ON latest.sentence_id = s.id AND latest.recency = 1
    )
    SELECT id, nl, uk, rule FROM sentence_queue
    ORDER BY queue_group,
      CASE queue_group
        WHEN 0 THEN -last_answered_at
        WHEN 1 THEN added_at
        ELSE last_answered_at
      END,
      random()
    LIMIT @limit
  `);
  const selectVocabularyStatement = database.prepare('SELECT nl, status FROM words ORDER BY nl');
  const insertAnswerStatement = database.prepare(`
    INSERT INTO order_sentence_answers (sentence_id, answered_at, is_correct, answer)
    VALUES (@sentenceId, @answeredAt, @isCorrect, @answer)
  `);
  const countSentencesStatement = database.prepare('SELECT COUNT(*) AS total FROM order_sentences');

  // Returns the new sentence's id, or null when a sentence with the same nl_key is already stored.
  function insertSentence({ nl, uk, rule, source, nlKey, addedAt }) {
    const insertResult = insertSentenceStatement.run({ nl, uk, rule, source, nlKey, addedAt });
    return insertResult.changes === 0 ? null : Number(insertResult.lastInsertRowid);
  }

  function findSentenceById(sentenceId) {
    return selectSentenceByIdStatement.get({ sentenceId }) ?? null;
  }

  function deleteSentence(sentenceId) {
    deleteSentenceStatement.run({ sentenceId });
  }

  function listSentencesNewestFirst() {
    return selectSentencesNewestFirstStatement.all();
  }

  function listSentencesForSet(limit) {
    return selectSentencesForSetStatement.all({ limit });
  }

  function listVocabulary() {
    return selectVocabularyStatement.all();
  }

  function createAnswer({ sentenceId, answeredAt, isCorrect, answer }) {
    insertAnswerStatement.run({ sentenceId, answeredAt, isCorrect: isCorrect ? 1 : 0, answer });
  }

  function countSentences() {
    return countSentencesStatement.get().total;
  }

  return Object.freeze({
    insertSentence,
    findSentenceById,
    deleteSentence,
    listSentencesNewestFirst,
    listSentencesForSet,
    listVocabulary,
    createAnswer,
    countSentences,
  });
}
