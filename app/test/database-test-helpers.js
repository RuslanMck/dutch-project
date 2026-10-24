// Builds a fresh in-memory database with every migration applied, and the domain services on top of it.
import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { createSystemClock } from '../src/time/system-clock.js';

// Returns { database, changeEventBus, clock, wordService, practiceService, priorityService, … }.
// clock: any object with now(); the default is the system clock. isFsrsFuzzEnabled: false keeps FSRS due dates exact.
export function createTestContext({ clock = createSystemClock(), isFsrsFuzzEnabled = false } = {}) {
  const database = createDatabaseConnection({ databasePath: ':memory:' });
  runDatabaseMigrations({ database, clock });
  const changeEventBus = createChangeEventBus({ clock });
  return {
    database,
    changeEventBus,
    clock,
    ...createDomainServices({ database, changeEventBus, clock, isFsrsFuzzEnabled }),
  };
}
