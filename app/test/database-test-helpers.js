// Builds a fresh in-memory database with every migration applied, and the domain services on top of it. Also a seeded
// random number generator (mulberry32) for tests that must shuffle the same way on every run.
import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { createTransactionRunner } from '../src/database/run-in-transaction.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { createWordOrderRepository } from '../src/domains/word-order/word-order-repository.js';
import { createWordOrderService } from '../src/domains/word-order/word-order-service.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { createSystemClock } from '../src/time/system-clock.js';

// Returns { database, changeEventBus, clock, wordService, practiceService, priorityService, … }.
// clock: any object with now(); the default is the system clock. isFsrsFuzzEnabled: false keeps FSRS due dates exact.
// random: a function returning numbers in [0, 1), e.g. mulberry32(seed). Given, the word order service uses it for its
// tiles and prompt sample (it is otherwise Math.random); the other services do not use random numbers.
export function createTestContext({ clock = createSystemClock(), isFsrsFuzzEnabled = false, random } = {}) {
  const database = createDatabaseConnection({ databasePath: ':memory:' });
  runDatabaseMigrations({ database, clock });
  const changeEventBus = createChangeEventBus({ clock });
  const domainServices = createDomainServices({ database, changeEventBus, clock, isFsrsFuzzEnabled });
  if (random === undefined) return { database, changeEventBus, clock, ...domainServices };
  const wordOrderService = createWordOrderService({
    wordOrderRepository: createWordOrderRepository({ database }),
    openRouterClient: createOpenRouterClient({ apiKey: undefined, model: undefined }),
    runInTransaction: createTransactionRunner({ database }),
    changeEventBus,
    clock,
    random,
  });
  return { database, changeEventBus, clock, ...domainServices, wordOrderService };
}

// mulberry32: a small seeded generator with the same sequence on every run and platform. Returns a function that gives
// the next number in [0, 1) each call.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandomNumber() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
