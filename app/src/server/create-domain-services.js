// Builds every repository and service on one database connection. The server, the import script and the tests
// all get their services from here, so they share one wiring. configuration is optional: without it (tests, scripts)
// the OpenRouter client is simply not configured.
import { createTransactionRunner } from '../database/run-in-transaction.js';
import { createArtifactExportRepository } from '../domains/artifact-export/artifact-export-repository.js';
import { createArtifactExportService } from '../domains/artifact-export/artifact-export-service.js';
import { createArtifactImportRepository } from '../domains/artifact-export/artifact-import-repository.js';
import { createArtifactImportService } from '../domains/artifact-export/artifact-import-service.js';
import { createDeckRepository } from '../domains/decks/deck-repository.js';
import { createDeckService } from '../domains/decks/deck-service.js';
import { createMistakeRepository } from '../domains/mistakes/mistake-repository.js';
import { createMistakeService } from '../domains/mistakes/mistake-service.js';
import { createPhraseRepository } from '../domains/phrases/phrase-repository.js';
import { createPhraseService } from '../domains/phrases/phrase-service.js';
import { createFrequencyRepository } from '../domains/practice/frequency-repository.js';
import { createFsrsScheduler } from '../domains/practice/fsrs-scheduling.js';
import { createWordSetPlanner } from '../domains/practice/word-set-planning.js';
import { createPhrasePracticeRepository } from '../domains/practice/phrase-practice-repository.js';
import { createPhrasePracticeService } from '../domains/practice/phrase-practice-service.js';
import { createPracticeRepository } from '../domains/practice/practice-repository.js';
import { createPracticeResetService } from '../domains/practice/practice-reset-service.js';
import { createPracticeService } from '../domains/practice/practice-service.js';
import { createPracticeSettings } from '../domains/practice/practice-settings.js';
import { createPriorityService } from '../domains/practice/priority-service.js';
import { createRuleRepository } from '../domains/rules/rule-repository.js';
import { createRuleService } from '../domains/rules/rule-service.js';
import { createSectionRepository } from '../domains/sections/section-repository.js';
import { createSectionService } from '../domains/sections/section-service.js';
import { createStatisticsRepository } from '../domains/statistics/statistics-repository.js';
import { createStatisticsService } from '../domains/statistics/statistics-service.js';
import { createTextRepository } from '../domains/texts/text-repository.js';
import { createTextService } from '../domains/texts/text-service.js';
import { createWordOrderRepository } from '../domains/word-order/word-order-repository.js';
import { createWordOrderService } from '../domains/word-order/word-order-service.js';
import { createTopicRepository } from '../domains/words/topic-repository.js';
import { createWordRepository } from '../domains/words/word-repository.js';
import { createWordService } from '../domains/words/word-service.js';
import { createOpenRouterClient } from '../integrations/openrouter-client.js';

export function createDomainServices({
  database,
  changeEventBus,
  clock,
  isFsrsFuzzEnabled = true,
  configuration = {},
}) {
  const runInTransaction = createTransactionRunner({ database });
  const sharedDependencies = { runInTransaction, changeEventBus, clock };

  const sectionService = createSectionService({ sectionRepository: createSectionRepository({ database }) });
  const wordRepository = createWordRepository({ database });
  const practiceRepository = createPracticeRepository({ database });
  const practiceSettings = createPracticeSettings({ practiceRepository });
  const priorityService = createPriorityService({
    practiceRepository,
    frequencyRepository: createFrequencyRepository({ database }),
    practiceSettings,
    runInTransaction,
    changeEventBus,
  });
  const wordService = createWordService({
    wordRepository,
    topicRepository: createTopicRepository({ database }),
    sectionService,
    priorityService,
    practiceSettings,
    ...sharedDependencies,
  });
  const fsrsScheduler = createFsrsScheduler({
    desiredRetention: practiceSettings.readSettings().desiredRetention,
    isFuzzEnabled: isFsrsFuzzEnabled,
  });
  const phrasePracticeRepository = createPhrasePracticeRepository({ database });
  const phrasePracticeService = createPhrasePracticeService({
    phrasePracticeRepository,
    practiceSettings,
    fsrsScheduler,
    ...sharedDependencies,
  });
  const wordSetPlanner = createWordSetPlanner({ practiceRepository });
  const practiceService = createPracticeService({
    practiceRepository,
    wordSetPlanner,
    practiceSettings,
    priorityService,
    wordService,
    fsrsScheduler,
    phrasePracticeService,
    ...sharedDependencies,
  });
  const practiceResetService = createPracticeResetService({
    practiceRepository,
    phrasePracticeRepository,
    practiceSettings,
    ...sharedDependencies,
  });
  const ruleService = createRuleService({
    ruleRepository: createRuleRepository({ database }),
    sectionService,
    ...sharedDependencies,
  });
  const mistakeService = createMistakeService({
    mistakeRepository: createMistakeRepository({ database }),
    ruleService,
    ...sharedDependencies,
  });
  const phraseService = createPhraseService({
    phraseRepository: createPhraseRepository({ database }),
    sectionService,
    practiceSettings,
    ...sharedDependencies,
  });
  const wordOrderService = createWordOrderService({
    wordOrderRepository: createWordOrderRepository({ database }),
    openRouterClient: createOpenRouterClient({
      apiKey: configuration.openRouterApiKey,
      model: configuration.openRouterModel,
    }),
    ...sharedDependencies,
  });
  const textService = createTextService({
    textRepository: createTextRepository({ database }),
    sectionService,
    ...sharedDependencies,
  });
  const statisticsService = createStatisticsService({
    statisticsRepository: createStatisticsRepository({ database }),
    practiceSettings,
    clock,
  });
  const artifactExportService = createArtifactExportService({
    artifactExportRepository: createArtifactExportRepository({ database }),
    ruleService,
    wordService,
    clock,
  });
  const deckService = createDeckService({
    deckRepository: createDeckRepository({ database }),
    practiceSettings,
    ...sharedDependencies,
  });
  const artifactImportService = createArtifactImportService({
    artifactImportRepository: createArtifactImportRepository({ database }),
    sectionService,
    wordService,
    practiceSettings,
    ...sharedDependencies,
  });

  return Object.freeze({
    wordService,
    practiceService,
    practiceResetService,
    phrasePracticeService,
    priorityService,
    practiceSettings,
    ruleService,
    mistakeService,
    phraseService,
    wordOrderService,
    textService,
    statisticsService,
    artifactExportService,
    artifactImportService,
    deckService,
  });
}
