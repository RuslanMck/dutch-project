// Formats the plain-text import report: duplicates to merge by hand and data issues found in the export. Pure.

// exportedWords: the export's words; issues: { countMismatch, unknownRules, unparsedRules }; counts: row counts.
export function formatImportReport({ exportedWords, issues, counts }) {
  const lines = ['Import report', ''];
  const duplicateWordGroups = listDuplicateWordGroups(exportedWords);
  lines.push(`Duplicate nl values (${duplicateWordGroups.length}), to merge by hand:`);
  for (const [dutchText, duplicateWords] of duplicateWordGroups) {
    const descriptions = duplicateWords.map(word => `${word.id} ("${word.uk}"${word.art ? `, ${word.art}` : ''})`);
    lines.push(`  ${dutchText}: ${descriptions.join(' | ')}`);
  }
  lines.push('');
  lines.push(`Mistake patterns where count != cases.length (${issues.countMismatch.length}):`);
  for (const mismatch of issues.countMismatch) {
    lines.push(`  ${mismatch.id}: count ${mismatch.count}, cases ${mismatch.cases}`);
  }
  lines.push('');
  lines.push(`Unknown rule ids (${issues.unknownRules.length}):`);
  for (const unknownRule of issues.unknownRules) {
    lines.push(`  pattern ${unknownRule.pattern} -> rule ${unknownRule.rule}`);
  }
  lines.push('');
  lines.push(`Rules whose topic could not be parsed (${issues.unparsedRules.length}):`);
  for (const ruleId of issues.unparsedRules) lines.push(`  ${ruleId}`);
  lines.push('');
  lines.push(`Words marked kind=expression: ${counts.expression_words}`);
  return lines.join('\n') + '\n';
}

function listDuplicateWordGroups(exportedWords) {
  const wordsByDutchText = new Map();
  for (const word of exportedWords) {
    if (!wordsByDutchText.has(word.nl)) wordsByDutchText.set(word.nl, []);
    wordsByDutchText.get(word.nl).push(word);
  }
  return [...wordsByDutchText].filter(([, words]) => words.length > 1);
}
