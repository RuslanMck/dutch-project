// SQL for textbook sections. No business rules.
export function createSectionRepository({ database }) {
  const ensureSectionStatement = database.prepare(`
    INSERT OR IGNORE INTO sections (code, title, is_textbook)
    VALUES (@code, NULL, @isTextbook)
  `);

  function ensureSection({ code, isTextbook }) {
    ensureSectionStatement.run({ code, isTextbook: isTextbook ? 1 : 0 });
  }

  return Object.freeze({ ensureSection });
}
