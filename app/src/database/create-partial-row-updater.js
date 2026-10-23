// Updates the given columns of one row. Column names come from an allow-list in code, never from input.
import { createStatementCache } from './create-statement-cache.js';

export function createPartialRowUpdater({ database, tableName, updatableColumnNames }) {
  const allowedColumnNames = new Set(updatableColumnNames);
  const statementCache = createStatementCache({ database });

  function updateRowColumns(rowId, valueByColumnName) {
    const columnNames = Object.keys(valueByColumnName);
    if (columnNames.length === 0) return;
    for (const columnName of columnNames) {
      if (!allowedColumnNames.has(columnName)) throw new Error(`${tableName}.${columnName} is not updatable`);
    }
    const assignments = columnNames.map(columnName => `${columnName} = @${columnName}`).join(', ');
    statementCache.prepareStatement(`UPDATE ${tableName} SET ${assignments} WHERE id = @rowId`)
      .run({ ...valueByColumnName, rowId });
  }

  return Object.freeze({ updateRowColumns });
}
