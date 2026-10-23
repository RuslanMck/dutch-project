// SQL for words, word_errors and practice_attempts; returns rows in the REST/MCP shape. No business rules.
import { createPartialRowUpdater } from '../../database/create-partial-row-updater.js';

const WORD_SELECT = `
  SELECT v_words.id, v_words.legacy_id, v_words.nl, v_words.uk, v_words.article, v_words.kind,
    v_words.example_nl, v_words.example_uk, topics.name AS topic, v_words.section_code AS section,
    v_words.status, v_words.error_count, v_words.added_at, v_words.updated_at
  FROM v_words
  LEFT JOIN topics ON topics.id = v_words.topic_id
`;

const WORD_FILTER = `
  WHERE (@learningStatus IS NULL OR v_words.status = @learningStatus)
    AND (@topicName IS NULL OR topics.name = @topicName)
`;

const ORDER_BY_SQL_BY_SORT_ORDER = Object.freeze({
  added: 'ORDER BY v_words.added_at ASC, v_words.id ASC',
  errors: 'ORDER BY v_words.error_count DESC, v_words.added_at ASC, v_words.id ASC',
});

const COLUMN_NAME_BY_FIELD_NAME = Object.freeze({
  dutchText: 'nl',
  ukrainianText: 'uk',
  article: 'article',
  kind: 'kind',
  exampleDutch: 'example_nl',
  exampleUkrainian: 'example_uk',
  topicId: 'topic_id',
  sectionCode: 'section_code',
  learningStatus: 'status',
  updatedAt: 'updated_at',
});

export function createWordRepository({ database }) {
  const selectWordByIdStatement = database.prepare(`${WORD_SELECT} WHERE v_words.id = @wordId`);
  const selectWordsStatementBySortOrder = Object.fromEntries(Object.entries(ORDER_BY_SQL_BY_SORT_ORDER)
    .map(([sortOrder, orderBySql]) => [sortOrder, database.prepare(`${WORD_SELECT} ${WORD_FILTER} ${orderBySql}`)]));
  const selectWordTextsAndArticlesStatement = database.prepare('SELECT id, nl, article FROM words');
  const insertWordStatement = database.prepare(`
    INSERT INTO words (
      nl, uk, article, kind, example_nl, example_uk, topic_id, section_code, status, added_at, updated_at
    )
    VALUES (
      @dutchText, @ukrainianText, @article, @kind, @exampleDutch, @exampleUkrainian, @topicId, @sectionCode,
      @learningStatus, @addedAt, @addedAt
    )
  `);
  const deleteWordStatement = database.prepare('DELETE FROM words WHERE id = @wordId');
  const insertWordErrorStatement = database.prepare(`
    INSERT INTO word_errors (word_id, occurred_at, source, mode, wrong_answer)
    VALUES (@wordId, @occurredAt, @source, @mode, @wrongAnswer)
  `);
  const insertPracticeAttemptStatement = database.prepare(`
    INSERT INTO practice_attempts (word_id, at, mode, answer, correct)
    VALUES (@wordId, @attemptedAt, @mode, @answer, @correct)
  `);
  const wordRowUpdater = createPartialRowUpdater({
    database,
    tableName: 'words',
    updatableColumnNames: Object.values(COLUMN_NAME_BY_FIELD_NAME),
  });

  function findWordById(wordId) {
    return selectWordByIdStatement.get({ wordId }) ?? null;
  }

  // sortOrder: 'added' (oldest first, the default) or 'errors' (most errors first).
  function listWords({ learningStatus, topicName, sortOrder } = {}) {
    return selectWordsStatementBySortOrder[sortOrder ?? 'added'].all({
      learningStatus: learningStatus ?? null,
      topicName: topicName ?? null,
    });
  }

  function listWordTextsAndArticles() {
    return selectWordTextsAndArticlesStatement.all();
  }

  // Returns the new word's id.
  function createWord(word) {
    const insertResult = insertWordStatement.run({
      dutchText: word.dutchText,
      ukrainianText: word.ukrainianText,
      article: word.article,
      kind: word.kind,
      exampleDutch: word.exampleDutch,
      exampleUkrainian: word.exampleUkrainian,
      topicId: word.topicId,
      sectionCode: word.sectionCode,
      learningStatus: word.learningStatus,
      addedAt: word.addedAt,
    });
    return Number(insertResult.lastInsertRowid);
  }

  // changes: any of the fields in COLUMN_NAME_BY_FIELD_NAME.
  function updateWord(wordId, changes) {
    const valueByColumnName = Object.fromEntries(Object.entries(changes)
      .map(([fieldName, value]) => [COLUMN_NAME_BY_FIELD_NAME[fieldName] ?? fieldName, value]));
    wordRowUpdater.updateRowColumns(wordId, valueByColumnName);
  }

  function deleteWord(wordId) {
    deleteWordStatement.run({ wordId });
  }

  function createWordError({ wordId, occurredAt, source, mode = null, wrongAnswer = null }) {
    insertWordErrorStatement.run({ wordId, occurredAt, source, mode, wrongAnswer });
  }

  function createPracticeAttempt({ wordId, attemptedAt, mode, answer, isCorrect }) {
    insertPracticeAttemptStatement.run({ wordId, attemptedAt, mode, answer, correct: isCorrect ? 1 : 0 });
  }

  return Object.freeze({
    findWordById,
    listWords,
    listWordTextsAndArticles,
    createWord,
    updateWord,
    deleteWord,
    createWordError,
    createPracticeAttempt,
  });
}
