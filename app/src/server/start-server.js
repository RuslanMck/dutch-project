// Entry point (npm start): reads the configuration, opens and migrates the database, builds the services and
// the application, listens on the port and starts the daily backups. The only module with start-up side effects.
import { createDatabaseBackupScheduler } from '../backups/database-backup-scheduler.js';
import { createChangeEventBus } from '../change-events/change-event-bus.js';
import { parseEnvironmentConfiguration } from '../configuration/environment-configuration.js';
import { createDatabaseConnection } from '../database/create-database-connection.js';
import { runDatabaseMigrations } from '../database/run-database-migrations.js';
import { createSystemClock } from '../time/system-clock.js';
import { createApplication } from './create-application.js';
import { createDomainServices } from './create-domain-services.js';

const configuration = parseEnvironmentConfiguration(process.env);
const clock = createSystemClock();
const database = createDatabaseConnection({ databasePath: configuration.databasePath });
runDatabaseMigrations({ database, clock });   // before accepting requests
const changeEventBus = createChangeEventBus({ clock });
const services = createDomainServices({ database, changeEventBus, clock, configuration });
const application = createApplication({ configuration, services, changeEventBus, clock });

application.listen(configuration.port, () => console.log(`dutch-app listening on :${configuration.port}`));
createDatabaseBackupScheduler({
  database,
  backupDirectory: configuration.backupDirectory,
  retentionCount: configuration.backupRetentionCount,
  clock,
}).startDailyBackups();
