// SQL for phrases; returns rows in the REST/MCP shape. No business rules.
const PHRASE_SELECT = `
  SELECT id, legacy_id, nl, uk, context, section_code AS section, added_at
  FROM phrases
`;

export function createPhraseRepository({ database }) {
  const selectPhraseByIdStatement = database.prepare(`${PHRASE_SELECT} WHERE id = @phraseId`);
  const selectPhrasesNewestFirstStatement = database.prepare(`${PHRASE_SELECT} ORDER BY added_at DESC, id DESC`);
  const insertPhraseStatement = database.prepare(`
    INSERT INTO phrases (nl, uk, context, section_code, added_at)
    VALUES (@dutchText, @ukrainianText, @context, @sectionCode, @addedAt)
  `);
  const deletePhraseStatement = database.prepare('DELETE FROM phrases WHERE id = @phraseId');

  function findPhraseById(phraseId) {
    return selectPhraseByIdStatement.get({ phraseId }) ?? null;
  }

  function listPhrasesNewestFirst() {
    return selectPhrasesNewestFirstStatement.all();
  }

  // Returns the new phrase's id.
  function createPhrase({ dutchText, ukrainianText, context, sectionCode, addedAt }) {
    const insertResult = insertPhraseStatement.run({ dutchText, ukrainianText, context, sectionCode, addedAt });
    return Number(insertResult.lastInsertRowid);
  }

  function deletePhrase(phraseId) {
    deletePhraseStatement.run({ phraseId });
  }

  return Object.freeze({ findPhraseById, listPhrasesNewestFirst, createPhrase, deletePhrase });
}
