// Builds a fresh in-memory database with every migration applied, and the domain services on top of it.
import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { createSystemClock } from '../src/time/system-clock.js';

// Returns { database, changeEventBus, clock, wordService, ruleService, … }.
export function createTestContext() {
  const clock = createSystemClock();
  const database = createDatabaseConnection({ databasePath: ':memory:' });
  runDatabaseMigrations({ database, clock });
  const changeEventBus = createChangeEventBus({ clock });
  return { database, changeEventBus, clock, ...createDomainServices({ database, changeEventBus, clock }) };
}
