// SQL for importing an artifact export: insert-or-update by legacy_id, legacy error rows, mistake cases and
// the row counts for the import report. No business rules.
import { createStatementCache } from '../../database/create-statement-cache.js';

export function createArtifactImportRepository({ database }) {
  const statementCache = createStatementCache({ database });
  const selectLegacyImportErrorIdsStatement = database.prepare(`
    SELECT id
    FROM word_errors
    WHERE word_id = @wordId AND source = 'legacy_import'
    ORDER BY id
  `).pluck();
  const insertLegacyImportErrorStatement = database.prepare(`
    INSERT INTO word_errors (word_id, occurred_at, source)
    VALUES (@wordId, NULL, 'legacy_import')
  `);
  const deleteWordErrorStatement = database.prepare('DELETE FROM word_errors WHERE id = @wordErrorId');
  const selectMistakeCaseExistsStatement = database.prepare(`
    SELECT 1
    FROM mistake_cases
    WHERE pattern_id = @patternId AND wrong_text = @wrongText AND right_text = @rightText
      AND occurred_on = @occurredOn
  `);
  const insertMistakeCaseStatement = database.prepare(`
    INSERT INTO mistake_cases (pattern_id, wrong_text, right_text, occurred_on, source, created_at)
    VALUES (@patternId, @wrongText, @rightText, @occurredOn, NULL, @createdAt)
  `);
  const selectCountStatementByName = Object.freeze({
    words: database.prepare('SELECT COUNT(*) FROM words').pluck(),
    word_errors: database.prepare('SELECT COUNT(*) FROM word_errors').pluck(),
    rules: database.prepare('SELECT COUNT(*) FROM rules').pluck(),
    mistake_patterns: database.prepare('SELECT COUNT(*) FROM mistake_patterns').pluck(),
    mistake_cases: database.prepare('SELECT COUNT(*) FROM mistake_cases').pluck(),
    phrases: database.prepare('SELECT COUNT(*) FROM phrases').pluck(),
    texts: database.prepare('SELECT COUNT(*) FROM texts').pluck(),
    sections: database.prepare('SELECT COUNT(*) FROM sections').pluck(),
    topics: database.prepare('SELECT COUNT(*) FROM topics').pluck(),
    expression_words: database.prepare("SELECT COUNT(*) FROM words WHERE kind = 'expression'").pluck(),
  });
  // Error count per rule, keyed by the rule's legacy id (or code); 'NULL' is the group outside the rules.
  const selectRuleErrorCountsStatement = database.prepare(`
    SELECT
      CASE WHEN v_rule_errors.rule_id IS NULL THEN 'NULL' ELSE COALESCE(rules.legacy_id, rules.code) END AS rule_key,
      v_rule_errors.error_count
    FROM v_rule_errors
    LEFT JOIN rules ON rules.id = v_rule_errors.rule_id
  `);

  // Each upsert returns the row id. An update writes only the columns that differ, so a second import leaves
  // unchanged rows (and their updated_at) as they are.
  function upsertRule({ legacyId, code, category, title, body, sortOrder, sectionCode, importedAt }) {
    return upsertRowByLegacyId({
      tableName: 'rules',
      legacyId,
      valueByColumnName: { code, category, title, body, sort_order: sortOrder, section_code: sectionCode },
      insertOnlyValueByColumnName: { created_at: importedAt, updated_at: importedAt },
      updatedAt: importedAt,
    });
  }

  function upsertWord(word) {
    return upsertRowByLegacyId({
      tableName: 'words',
      legacyId: word.legacyId,
      valueByColumnName: {
        nl: word.dutchText,
        uk: word.ukrainianText,
        article: word.article,
        kind: word.kind,
        example_nl: word.exampleDutch,
        example_uk: word.exampleUkrainian,
        topic_id: word.topicId,
        section_code: word.sectionCode,
        status: word.learningStatus,
        added_at: word.addedAt,
      },
      insertOnlyValueByColumnName: { updated_at: word.addedAt },
      updatedAt: word.importedAt,
    });
  }

  function upsertPhrase({ legacyId, dutchText, ukrainianText, context, addedAt }) {
    return upsertRowByLegacyId({
      tableName: 'phrases',
      legacyId,
      valueByColumnName: { nl: dutchText, uk: ukrainianText, context, added_at: addedAt },
    });
  }

  function upsertText({ legacyId, title, sectionCode, body, addedAt }) {
    return upsertRowByLegacyId({
      tableName: 'texts',
      legacyId,
      valueByColumnName: { title, section_code: sectionCode, body, added_at: addedAt },
    });
  }

  function upsertMistakePattern({ legacyId, ruleId, title, fix, createdAt }) {
    return upsertRowByLegacyId({
      tableName: 'mistake_patterns',
      legacyId,
      valueByColumnName: { rule_id: ruleId, title, fix },
      insertOnlyValueByColumnName: { created_at: createdAt },
    });
  }

  function listLegacyImportErrorIds(wordId) {
    return selectLegacyImportErrorIdsStatement.all({ wordId });
  }

  function createLegacyImportError(wordId) {
    insertLegacyImportErrorStatement.run({ wordId });
  }

  function deleteWordError(wordErrorId) {
    deleteWordErrorStatement.run({ wordErrorId });
  }

  function hasMistakeCase({ patternId, wrongText, rightText, occurredOn }) {
    return selectMistakeCaseExistsStatement.get({ patternId, wrongText, rightText, occurredOn }) !== undefined;
  }

  function createMistakeCase({ patternId, wrongText, rightText, occurredOn, createdAt }) {
    insertMistakeCaseStatement.run({ patternId, wrongText, rightText, occurredOn, createdAt });
  }

  function countImportedRows() {
    const rowCountByName = Object.fromEntries(Object.entries(selectCountStatementByName)
      .map(([name, statement]) => [name, statement.get()]));
    const ruleErrors = Object.fromEntries(selectRuleErrorCountsStatement.all()
      .map(row => [row.rule_key, row.error_count]));
    return { ...rowCountByName, rule_errors: ruleErrors };
  }

  // tableName and the column names come from the functions above, never from the export file.
  // updatedAt: when given, an update also sets updated_at.
  function upsertRowByLegacyId({
    tableName,
    legacyId,
    valueByColumnName,
    insertOnlyValueByColumnName = {},
    updatedAt = null,
  }) {
    const columnNames = Object.keys(valueByColumnName);
    const existingRow = statementCache
      .prepareStatement(`SELECT id, ${columnNames.join(', ')} FROM ${tableName} WHERE legacy_id = @legacyId`)
      .get({ legacyId });
    if (!existingRow) {
      const insertedValueByColumnName = { legacy_id: legacyId, ...valueByColumnName, ...insertOnlyValueByColumnName };
      const insertedColumnNames = Object.keys(insertedValueByColumnName);
      const placeholders = insertedColumnNames.map(columnName => `@${columnName}`).join(', ');
      const insertResult = statementCache
        .prepareStatement(`INSERT INTO ${tableName} (${insertedColumnNames.join(', ')}) VALUES (${placeholders})`)
        .run(insertedValueByColumnName);
      return Number(insertResult.lastInsertRowid);
    }
    const changedColumnNames = columnNames
      .filter(columnName => !isSameValue(existingRow[columnName], valueByColumnName[columnName]));
    if (changedColumnNames.length) {
      const changeByColumnName = Object.fromEntries(changedColumnNames
        .map(columnName => [columnName, valueByColumnName[columnName]]));
      if (updatedAt !== null) changeByColumnName.updated_at = updatedAt;
      const assignments = Object.keys(changeByColumnName).map(columnName => `${columnName} = @${columnName}`);
      statementCache.prepareStatement(`UPDATE ${tableName} SET ${assignments.join(', ')} WHERE id = @rowId`)
        .run({ ...changeByColumnName, rowId: existingRow.id });
    }
    return existingRow.id;
  }

  return Object.freeze({
    upsertRule,
    upsertWord,
    upsertPhrase,
    upsertText,
    upsertMistakePattern,
    listLegacyImportErrorIds,
    createLegacyImportError,
    deleteWordError,
    hasMistakeCase,
    createMistakeCase,
    countImportedRows,
  });
}

function isSameValue(storedValue, importedValue) {
  return (storedValue ?? null) === (importedValue ?? null);
}
