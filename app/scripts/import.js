// CLI: idempotent import of a claude.ai artifact export (handoff section 3.1) into the database at DB_PATH.
//   node scripts/import.js <path-to-export.json>
// Re-running updates rows matched by legacy_id and adds only what is missing. The work is done by the
// artifact import service; this file reads the file, opens the database and prints the result.
import fs from 'node:fs';
import path from 'node:path';

import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { createSystemClock } from '../src/time/system-clock.js';

const REPORT_FILE_NAME = 'import-report.txt';
const COUNT_LABEL_WIDTH = 18;

const exportFilePath = process.argv[2];
if (!exportFilePath) {
  console.error('usage: node scripts/import.js <path-to-export.json>');
  process.exit(2);
}

const exportDocument = JSON.parse(fs.readFileSync(exportFilePath, 'utf8'));
const { databasePath } = parseEnvironmentConfiguration(process.env, { shouldRequireSecrets: false });
const clock = createSystemClock();
const database = createDatabaseConnection({ databasePath });
runDatabaseMigrations({ database, clock });
const { artifactImportService } = createDomainServices({
  database,
  changeEventBus: createChangeEventBus({ clock }),
  clock,
});

const { counts, report } = artifactImportService.importArtifactExport(exportDocument);
const reportFilePath = path.join(process.cwd(), REPORT_FILE_NAME);
fs.writeFileSync(reportFilePath, report);
console.log(`report written to ${reportFilePath}`);
for (const [countName, countValue] of Object.entries(counts)) {
  if (countName === 'rule_errors') {
    const ruleErrorList = Object.entries(countValue).map(([ruleKey, errorCount]) => `${ruleKey} ${errorCount}`);
    console.log(`${countName.padEnd(COUNT_LABEL_WIDTH)} ${ruleErrorList.join(', ')}`);
  } else {
    console.log(`${countName.padEnd(COUNT_LABEL_WIDTH)} ${countValue}`);
  }
}
database.close();
