// CLI: imports a word-frequency list into word_frequencies and re-ranks every word. Each line is form<TAB>rank with
// rank 1 = most frequent; blank and malformed lines are skipped. The priority service does the work; this file reads
// the file, opens the database and prints the result.
//   node scripts/import-frequency-list.js <path-to-tsv>
import fs from 'node:fs';

import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { frequencyEntrySchema } from '../src/contracts/practice-contracts.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { createSystemClock } from '../src/time/system-clock.js';

const FIELD_SEPARATOR = '\t';
const FIELD_COUNT = 2;

const frequencyFilePath = process.argv[2];
if (!frequencyFilePath) {
  console.error('usage: node scripts/import-frequency-list.js <path-to-tsv>');
  process.exit(2);
}

const { entries, skippedLineCount } = readFrequencyEntries(frequencyFilePath);
const { databasePath } = parseEnvironmentConfiguration(process.env, { shouldRequireSecrets: false });
const clock = createSystemClock();
const database = createDatabaseConnection({ databasePath });
runDatabaseMigrations({ database, clock });
const { priorityService } = createDomainServices({
  database,
  changeEventBus: createChangeEventBus({ clock }),
  clock,
});

const result = priorityService.importFrequencyList(entries, { shouldReplaceExisting: true });
console.log(`imported ${result.imported} forms (skipped ${skippedLineCount} lines)`);
console.log(`ranked ${result.words_ranked} words, ${result.words_unranked} unranked`);
database.close();

// Returns the valid lines as { wordForm, frequencyRank } entries, and how many lines were skipped.
function readFrequencyEntries(filePath) {
  const entries = [];
  let skippedLineCount = 0;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const fields = line.split(FIELD_SEPARATOR);
    const parseResult = fields.length === FIELD_COUNT
      ? frequencyEntrySchema.safeParse({ form: fields[0], rank: Number(fields[1]) })
      : null;
    if (parseResult?.success) {
      entries.push({ wordForm: parseResult.data.form, frequencyRank: parseResult.data.rank });
    } else {
      skippedLineCount += 1;
    }
  }
  return { entries, skippedLineCount };
}
