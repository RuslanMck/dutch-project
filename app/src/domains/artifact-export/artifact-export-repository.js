// Read-only queries for the artifact export, in the export's order (oldest first). Words and rules come from
// their services instead. No business rules.
export function createArtifactExportRepository({ database }) {
  const selectMistakePatternsStatement = database.prepare(`
    SELECT id, legacy_id, rule_id, title, fix
    FROM mistake_patterns
    ORDER BY id
  `);
  const selectMistakeCasesStatement = database.prepare(`
    SELECT pattern_id, wrong_text, right_text, occurred_on, created_at
    FROM mistake_cases
    ORDER BY created_at ASC, id ASC
  `);
  const selectPhrasesStatement = database.prepare(`
    SELECT id, legacy_id, nl, uk, context, section_code AS section, added_at
    FROM phrases
    ORDER BY added_at ASC, id ASC
  `);
  const selectTextsStatement = database.prepare(`
    SELECT id, legacy_id, title, section_code AS section, body, added_at
    FROM texts
    ORDER BY added_at ASC, id ASC
  `);

  function listMistakePatterns() {
    return selectMistakePatternsStatement.all();
  }

  function listMistakeCases() {
    return selectMistakeCasesStatement.all();
  }

  function listPhrases() {
    return selectPhrasesStatement.all();
  }

  function listTexts() {
    return selectTextsStatement.all();
  }

  return Object.freeze({ listMistakePatterns, listMistakeCases, listPhrases, listTexts });
}
