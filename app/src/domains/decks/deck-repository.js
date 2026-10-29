// SQL for custom decks and their words, and the word catalog with its answer totals. No business rules. The totals
// count the counting answers in deck_answers (superseded_at NULL): answer_count is every answer ever, in both
// directions; mistake_count is the mistakes (a grade other than good, the same as the round summary) among the word's
// last DIFFICULTY_ANSWER_WINDOW counting answers, so a long-practised word is judged by its recent answers.
const DIFFICULTY_ANSWER_WINDOW = 10;
const CATALOG_FROM_SQL = `
  FROM words
  LEFT JOIN (
    SELECT deck_answers.word_id, COUNT(*) AS answer_count, MAX(deck_answers.answered_at) AS last_answered_at
    FROM deck_answers
    WHERE deck_answers.superseded_at IS NULL
    GROUP BY deck_answers.word_id
  ) AS answer_totals ON answer_totals.word_id = words.id
  LEFT JOIN (
    SELECT newest_answers.word_id,
      SUM(CASE WHEN newest_answers.grade <> 'good' THEN 1 ELSE 0 END) AS mistake_count
    FROM (
      SELECT deck_answers.word_id, deck_answers.grade,
        ROW_NUMBER() OVER (
          PARTITION BY deck_answers.word_id ORDER BY deck_answers.answered_at DESC, deck_answers.id DESC
        ) AS newest_rank
      FROM deck_answers
      WHERE deck_answers.superseded_at IS NULL
    ) AS newest_answers
    WHERE newest_answers.newest_rank <= ${DIFFICULTY_ANSWER_WINDOW}
    GROUP BY newest_answers.word_id
  ) AS recent_totals ON recent_totals.word_id = words.id
`;
const CATALOG_SELECT_SQL = `
  SELECT words.id, words.nl, words.uk, words.article, words.section_code AS section, words.status,
    answer_totals.answer_count, recent_totals.mistake_count, answer_totals.last_answered_at
  ${CATALOG_FROM_SQL}
`;
const DECK_SELECT_SQL = `
  SELECT custom_decks.id, custom_decks.name, custom_decks.description, custom_decks.created_at,
    custom_decks.updated_at, COUNT(custom_deck_words.word_id) AS word_count
  FROM custom_decks
  LEFT JOIN custom_deck_words ON custom_deck_words.deck_id = custom_decks.id
`;

export function createDeckRepository({ database }) {
  const selectDeckRowsStatement = database.prepare(`
    ${DECK_SELECT_SQL}
    GROUP BY custom_decks.id
    ORDER BY custom_decks.updated_at DESC, custom_decks.id DESC
  `);
  const selectDeckRowStatement = database.prepare(`
    ${DECK_SELECT_SQL}
    WHERE custom_decks.id = @deckId
    GROUP BY custom_decks.id
  `);
  const selectDeckNamesStatement = database.prepare('SELECT id, name FROM custom_decks');
  const selectDeckWordRowsStatement = database.prepare(`
    ${CATALOG_SELECT_SQL}
    JOIN custom_deck_words ON custom_deck_words.word_id = words.id
    WHERE custom_deck_words.deck_id = @deckId
    ORDER BY custom_deck_words.added_at ASC, custom_deck_words.rowid ASC
  `);
  const selectCatalogRowsStatement = database.prepare(`
    ${CATALOG_SELECT_SQL}
    ORDER BY words.nl COLLATE NOCASE ASC, words.id ASC
  `);
  const selectExistingWordIdsStatement = database.prepare(`
    SELECT words.id FROM words
    WHERE words.id IN (SELECT json_each.value FROM json_each(@wordIdsJson))
  `).pluck();
  const insertDeckStatement = database.prepare(`
    INSERT INTO custom_decks (name, description, created_at, updated_at)
    VALUES (@name, @description, @createdAt, @updatedAt)
  `);
  const updateDeckStatement = database.prepare(`
    UPDATE custom_decks
    SET name = @name, description = @description, updated_at = @updatedAt
    WHERE id = @deckId
  `);
  const deleteDeckStatement = database.prepare('DELETE FROM custom_decks WHERE id = @deckId');
  const insertDeckWordStatement = database.prepare(`
    INSERT OR IGNORE INTO custom_deck_words (deck_id, word_id, added_at)
    VALUES (@deckId, @wordId, @addedAt)
  `);
  const deleteAllDeckWordsStatement = database.prepare('DELETE FROM custom_deck_words WHERE deck_id = @deckId');
  const deleteDeckWordsStatement = database.prepare(`
    DELETE FROM custom_deck_words
    WHERE deck_id = @deckId AND word_id IN (SELECT json_each.value FROM json_each(@wordIdsJson))
  `);
  const countDeckWordsStatement = database.prepare(`
    SELECT COUNT(*) FROM custom_deck_words WHERE deck_id = @deckId
  `).pluck();

  // Every deck with its word count, newest change first.
  function listDeckRows() {
    return selectDeckRowsStatement.all();
  }

  function findDeckRow(deckId) {
    return selectDeckRowStatement.get({ deckId }) ?? null;
  }

  // The deck's words with their catalog fields, in the order added.
  function listDeckWordRows(deckId) {
    return selectDeckWordRowsStatement.all({ deckId });
  }

  // Every word with its answer totals (answer_count and last_answered_at are NULL when never answered), by nl.
  function listCatalogRows() {
    return selectCatalogRowsStatement.all();
  }

  function listDeckNames() {
    return selectDeckNamesStatement.all();
  }

  // The ids among wordIds that exist as words.
  function findExistingWordIds(wordIds) {
    return selectExistingWordIdsStatement.all({ wordIdsJson: JSON.stringify(wordIds) });
  }

  // Returns the new deck's id.
  function insertDeck({ name, description, createdAt, updatedAt }) {
    const insertResult = insertDeckStatement.run({ name, description, createdAt, updatedAt });
    return Number(insertResult.lastInsertRowid);
  }

  function updateDeck(deckId, { name, description, updatedAt }) {
    updateDeckStatement.run({ deckId, name, description, updatedAt });
  }

  function deleteDeck(deckId) {
    deleteDeckStatement.run({ deckId });
  }

  // Adds the words in the order given; a word already in the deck keeps its place and its added_at.
  function insertDeckWords(deckId, wordIds, addedAt) {
    for (const wordId of wordIds) insertDeckWordStatement.run({ deckId, wordId, addedAt });
  }

  function deleteAllDeckWords(deckId) {
    deleteAllDeckWordsStatement.run({ deckId });
  }

  function deleteDeckWords(deckId, wordIds) {
    deleteDeckWordsStatement.run({ deckId, wordIdsJson: JSON.stringify(wordIds) });
  }

  function countDeckWords(deckId) {
    return countDeckWordsStatement.get({ deckId });
  }

  return Object.freeze({
    listDeckRows,
    findDeckRow,
    listDeckWordRows,
    listCatalogRows,
    listDeckNames,
    findExistingWordIds,
    insertDeck,
    updateDeck,
    deleteDeck,
    insertDeckWords,
    deleteAllDeckWords,
    deleteDeckWords,
    countDeckWords,
  });
}
