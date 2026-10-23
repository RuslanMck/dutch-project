// Prepares each SQL text once, for statements whose column list is chosen at run time from constants.
export function createStatementCache({ database }) {
  const statementBySql = new Map();

  function prepareStatement(sql) {
    if (!statementBySql.has(sql)) statementBySql.set(sql, database.prepare(sql));
    return statementBySql.get(sql);
  }

  return Object.freeze({ prepareStatement });
}
