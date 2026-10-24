// SQL for word_frequencies: the frequency rank of each word form. No business rules and no transactions.
export function createFrequencyRepository({ database }) {
  const deleteAllFrequenciesStatement = database.prepare('DELETE FROM word_frequencies');
  const insertFrequencyStatement = database.prepare(`
    INSERT INTO word_frequencies (word_form, frequency_rank)
    VALUES (@wordForm, @frequencyRank)
  `);
  const upsertFrequencyStatement = database.prepare(`
    INSERT INTO word_frequencies (word_form, frequency_rank)
    VALUES (@wordForm, @frequencyRank)
    ON CONFLICT (word_form) DO UPDATE SET frequency_rank = excluded.frequency_rank
  `);
  const selectRankByFormStatement = database.prepare(`
    SELECT word_frequencies.frequency_rank
    FROM word_frequencies
    WHERE word_frequencies.word_form = @wordForm
  `).pluck();
  const countFrequenciesStatement = database.prepare('SELECT COUNT(*) FROM word_frequencies').pluck();

  // entries: [{ wordForm, frequencyRank }]. Deletes every existing row first.
  function replaceAllFrequencies(entries) {
    deleteAllFrequenciesStatement.run();
    addFrequencyEntries(insertFrequencyStatement, entries);
  }

  // entries: [{ wordForm, frequencyRank }]. An existing form gets the new rank.
  function upsertFrequencies(entries) {
    addFrequencyEntries(upsertFrequencyStatement, entries);
  }

  // Returns the rank of the form (matched case-insensitively by the column collation), or null.
  function findRankByForm(wordForm) {
    return selectRankByFormStatement.get({ wordForm }) ?? null;
  }

  function countFrequencies() {
    return countFrequenciesStatement.get();
  }

  return Object.freeze({ replaceAllFrequencies, upsertFrequencies, findRankByForm, countFrequencies });
}

function addFrequencyEntries(statement, entries) {
  for (const { wordForm, frequencyRank } of normalizeFrequencyEntries(entries)) {
    statement.run({ wordForm, frequencyRank });
  }
}

// Lowercases the forms and keeps the smaller rank when a form appears twice, so each form is written once.
function normalizeFrequencyEntries(entries) {
  const rankByWordForm = new Map();
  for (const { wordForm, frequencyRank } of entries) {
    const lowercaseWordForm = wordForm.toLowerCase();
    const existingRank = rankByWordForm.get(lowercaseWordForm);
    if (existingRank === undefined || frequencyRank < existingRank) {
      rankByWordForm.set(lowercaseWordForm, frequencyRank);
    }
  }
  return [...rankByWordForm].map(([wordForm, frequencyRank]) => ({ wordForm, frequencyRank }));
}
