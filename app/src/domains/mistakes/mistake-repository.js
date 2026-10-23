// SQL for mistake_patterns and mistake_cases; returns patterns in the REST/MCP shape with their cases attached.
// No business rules.
const PATTERN_SELECT = `
  SELECT v_mistake_patterns.id, v_mistake_patterns.legacy_id, v_mistake_patterns.rule_id, rules.code AS rule_code,
    v_mistake_patterns.title, v_mistake_patterns.fix, v_mistake_patterns.count, v_mistake_patterns.last_on,
    v_mistake_patterns.created_at
  FROM v_mistake_patterns
  LEFT JOIN rules ON rules.id = v_mistake_patterns.rule_id
`;

export function createMistakeRepository({ database }) {
  const selectPatternByIdStatement = database.prepare(`${PATTERN_SELECT} WHERE v_mistake_patterns.id = @patternId`);
  // Each filter applies only when its has…Filter flag is 1. A NULL ruleId or ruleCode means "outside the rules".
  const selectPatternsStatement = database.prepare(`
    ${PATTERN_SELECT}
    WHERE (@hasRuleIdFilter = 0 OR v_mistake_patterns.rule_id IS @ruleId)
      AND (
        @hasRuleCodeFilter = 0
        OR (@ruleCode IS NULL AND v_mistake_patterns.rule_id IS NULL)
        OR v_mistake_patterns.rule_id IN (SELECT rules.id FROM rules WHERE rules.code = @ruleCode)
      )
    ORDER BY v_mistake_patterns.count DESC, v_mistake_patterns.last_on DESC, v_mistake_patterns.id
  `);
  const selectCasesByPatternIdStatement = database.prepare(`
    SELECT id, wrong_text, right_text, occurred_on, source, created_at
    FROM mistake_cases
    WHERE pattern_id = @patternId
    ORDER BY occurred_on DESC, id DESC
  `);
  const selectPatternTitlesByRuleIdStatement = database.prepare(`
    SELECT id, title
    FROM mistake_patterns
    WHERE rule_id IS @ruleId
    ORDER BY id
  `);
  const selectPatternExistsStatement = database.prepare('SELECT 1 FROM mistake_patterns WHERE id = @patternId');
  const selectCaseExistsStatement = database.prepare('SELECT 1 FROM mistake_cases WHERE id = @caseId');
  const insertPatternStatement = database.prepare(`
    INSERT INTO mistake_patterns (rule_id, title, fix, created_at)
    VALUES (@ruleId, @title, @fix, @createdAt)
  `);
  const deletePatternStatement = database.prepare('DELETE FROM mistake_patterns WHERE id = @patternId');
  const insertCaseStatement = database.prepare(`
    INSERT INTO mistake_cases (pattern_id, wrong_text, right_text, occurred_on, source, created_at)
    VALUES (@patternId, @wrongText, @rightText, @occurredOn, @source, @createdAt)
  `);
  const deleteCaseStatement = database.prepare('DELETE FROM mistake_cases WHERE id = @caseId');

  function findPatternById(patternId) {
    const patternRow = selectPatternByIdStatement.get({ patternId });
    return patternRow ? attachCases(patternRow) : null;
  }

  // ruleIdFilter / ruleCodeFilter: undefined for no filter; null for patterns outside the rules.
  function listPatterns({ ruleIdFilter, ruleCodeFilter } = {}) {
    return selectPatternsStatement.all({
      hasRuleIdFilter: ruleIdFilter === undefined ? 0 : 1,
      ruleId: ruleIdFilter ?? null,
      hasRuleCodeFilter: ruleCodeFilter === undefined ? 0 : 1,
      ruleCode: ruleCodeFilter ?? null,
    }).map(attachCases);
  }

  function listPatternTitlesByRuleId(ruleId) {
    return selectPatternTitlesByRuleIdStatement.all({ ruleId });
  }

  function hasPattern(patternId) {
    return selectPatternExistsStatement.get({ patternId }) !== undefined;
  }

  function hasCase(caseId) {
    return selectCaseExistsStatement.get({ caseId }) !== undefined;
  }

  // Returns the new pattern's id.
  function createPattern({ ruleId, title, fix, createdAt }) {
    return Number(insertPatternStatement.run({ ruleId, title, fix, createdAt }).lastInsertRowid);
  }

  function deletePattern(patternId) {
    deletePatternStatement.run({ patternId });
  }

  function createCase({ patternId, wrongText, rightText, occurredOn, source, createdAt }) {
    insertCaseStatement.run({ patternId, wrongText, rightText, occurredOn, source, createdAt });
  }

  function deleteCase(caseId) {
    deleteCaseStatement.run({ caseId });
  }

  function attachCases(patternRow) {
    return { ...patternRow, cases: selectCasesByPatternIdStatement.all({ patternId: patternRow.id }) };
  }

  return Object.freeze({
    findPatternById,
    listPatterns,
    listPatternTitlesByRuleId,
    hasPattern,
    hasCase,
    createPattern,
    deletePattern,
    createCase,
    deleteCase,
  });
}
