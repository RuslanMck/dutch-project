// SQL for grammar rules; returns rows in the REST/MCP shape, with the error count from v_rule_errors.
// No business rules.
import { createPartialRowUpdater } from '../../database/create-partial-row-updater.js';

const RULE_SELECT = `
  SELECT rules.id, rules.legacy_id, rules.code, rules.category, rules.title, rules.body, rules.sort_order,
    rules.section_code AS section, COALESCE(v_rule_errors.error_count, 0) AS error_count,
    rules.created_at, rules.updated_at
  FROM rules
  LEFT JOIN v_rule_errors ON v_rule_errors.rule_id = rules.id
`;

const COLUMN_NAME_BY_FIELD_NAME = Object.freeze({
  code: 'code',
  category: 'category',
  title: 'title',
  body: 'body',
  sortOrder: 'sort_order',
  sectionCode: 'section_code',
  updatedAt: 'updated_at',
});

export function createRuleRepository({ database }) {
  const selectRuleByIdStatement = database.prepare(`${RULE_SELECT} WHERE rules.id = @ruleId`);
  // Codes are not unique: the first rule in display order wins.
  const selectFirstRuleByCodeStatement = database.prepare(`
    ${RULE_SELECT}
    WHERE rules.code = @code
    ORDER BY rules.sort_order, rules.id
    LIMIT 1
  `);
  const selectRulesStatement = database.prepare(`${RULE_SELECT} ORDER BY rules.sort_order, rules.id`);
  const selectMaximumSortOrderStatement = database.prepare('SELECT COALESCE(MAX(sort_order), 0) FROM rules').pluck();
  const insertRuleStatement = database.prepare(`
    INSERT INTO rules (legacy_id, code, category, title, body, sort_order, section_code, created_at, updated_at)
    VALUES (@legacyId, @code, @category, @title, @body, @sortOrder, @sectionCode, @createdAt, @createdAt)
  `);
  const deleteRuleStatement = database.prepare('DELETE FROM rules WHERE id = @ruleId');
  const ruleRowUpdater = createPartialRowUpdater({
    database,
    tableName: 'rules',
    updatableColumnNames: Object.values(COLUMN_NAME_BY_FIELD_NAME),
  });

  function findRuleById(ruleId) {
    return selectRuleByIdStatement.get({ ruleId }) ?? null;
  }

  function findFirstRuleByCode(code) {
    return selectFirstRuleByCodeStatement.get({ code }) ?? null;
  }

  function listRules() {
    return selectRulesStatement.all();
  }

  // 0 when there are no rules.
  function findMaximumSortOrder() {
    return selectMaximumSortOrderStatement.get();
  }

  // Returns the new rule's id.
  function createRule({ legacyId, code, category, title, body, sortOrder, sectionCode, createdAt }) {
    const insertResult = insertRuleStatement.run({
      legacyId,
      code,
      category,
      title,
      body,
      sortOrder,
      sectionCode,
      createdAt,
    });
    return Number(insertResult.lastInsertRowid);
  }

  // changes: any of the fields in COLUMN_NAME_BY_FIELD_NAME.
  function updateRule(ruleId, changes) {
    const valueByColumnName = Object.fromEntries(Object.entries(changes)
      .map(([fieldName, value]) => [COLUMN_NAME_BY_FIELD_NAME[fieldName] ?? fieldName, value]));
    ruleRowUpdater.updateRowColumns(ruleId, valueByColumnName);
  }

  function deleteRule(ruleId) {
    deleteRuleStatement.run({ ruleId });
  }

  return Object.freeze({
    findRuleById,
    findFirstRuleByCode,
    listRules,
    findMaximumSortOrder,
    createRule,
    updateRule,
    deleteRule,
  });
}
