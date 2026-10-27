// CLI: rebuilds the learning deck from the review logs that still count (run once after migration 006, or to repair
// the deck). Prints every word's position; writes only with --apply. The practice service does the work.
//   node scripts/rebuild-learning-deck.js [--apply]
import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { createSystemClock } from '../src/time/system-clock.js';

const APPLY_FLAG = '--apply';

const isDryRun = !process.argv.includes(APPLY_FLAG);
const { databasePath } = parseEnvironmentConfiguration(process.env, { shouldRequireSecrets: false });
const clock = createSystemClock();
const database = createDatabaseConnection({ databasePath });
runDatabaseMigrations({ database, clock });
const { practiceService } = createDomainServices({
  database,
  changeEventBus: createChangeEventBus({ clock }),
  clock,
});

const summary = practiceService.rebuildLearningDeck({ isDryRun });
for (const word of summary.words) {
  const position = word.in_deck
    ? `in deck, ${word.times_left} left (${word.correct_count}/${word.required_correct})`
    : 'learned';
  console.log(`${word.nl}: ${word.grades.join(' ')} → ${position}`);
}
console.log(`${isDryRun ? 'dry run' : 'applied'}: ${summary.deck_size} words in the deck`);
database.close();
