// SQL for bilingual texts; returns rows in the REST/MCP shape. No business rules.
import { createPartialRowUpdater } from '../../database/create-partial-row-updater.js';

const TEXT_SELECT = `
  SELECT id, legacy_id, title, section_code AS section, body, added_at
  FROM texts
`;

const COLUMN_NAME_BY_FIELD_NAME = Object.freeze({
  title: 'title',
  body: 'body',
  sectionCode: 'section_code',
});

export function createTextRepository({ database }) {
  const selectTextByIdStatement = database.prepare(`${TEXT_SELECT} WHERE id = @textId`);
  const selectTextsNewestFirstStatement = database.prepare(`${TEXT_SELECT} ORDER BY added_at DESC, id DESC`);
  const insertTextStatement = database.prepare(`
    INSERT INTO texts (title, section_code, body, added_at)
    VALUES (@title, @sectionCode, @body, @addedAt)
  `);
  const deleteTextStatement = database.prepare('DELETE FROM texts WHERE id = @textId');
  const textRowUpdater = createPartialRowUpdater({
    database,
    tableName: 'texts',
    updatableColumnNames: Object.values(COLUMN_NAME_BY_FIELD_NAME),
  });

  function findTextById(textId) {
    return selectTextByIdStatement.get({ textId }) ?? null;
  }

  function listTextsNewestFirst() {
    return selectTextsNewestFirstStatement.all();
  }

  // Returns the new text's id.
  function createText({ title, sectionCode, body, addedAt }) {
    return Number(insertTextStatement.run({ title, sectionCode, body, addedAt }).lastInsertRowid);
  }

  // changes: any of the fields in COLUMN_NAME_BY_FIELD_NAME.
  function updateText(textId, changes) {
    const valueByColumnName = Object.fromEntries(Object.entries(changes)
      .map(([fieldName, value]) => [COLUMN_NAME_BY_FIELD_NAME[fieldName] ?? fieldName, value]));
    textRowUpdater.updateRowColumns(textId, valueByColumnName);
  }

  function deleteText(textId) {
    deleteTextStatement.run({ textId });
  }

  return Object.freeze({ findTextById, listTextsNewestFirst, createText, updateText, deleteText });
}
