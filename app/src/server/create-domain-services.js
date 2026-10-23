// Builds every repository and service on one database connection. The server, the import script and the tests
// all get their services from here, so they share one wiring.
import { createTransactionRunner } from '../database/run-in-transaction.js';
import { createArtifactExportRepository } from '../domains/artifact-export/artifact-export-repository.js';
import { createArtifactExportService } from '../domains/artifact-export/artifact-export-service.js';
import { createArtifactImportRepository } from '../domains/artifact-export/artifact-import-repository.js';
import { createArtifactImportService } from '../domains/artifact-export/artifact-import-service.js';
import { createMistakeRepository } from '../domains/mistakes/mistake-repository.js';
import { createMistakeService } from '../domains/mistakes/mistake-service.js';
import { createPhraseRepository } from '../domains/phrases/phrase-repository.js';
import { createPhraseService } from '../domains/phrases/phrase-service.js';
import { createRuleRepository } from '../domains/rules/rule-repository.js';
import { createRuleService } from '../domains/rules/rule-service.js';
import { createSectionRepository } from '../domains/sections/section-repository.js';
import { createSectionService } from '../domains/sections/section-service.js';
import { createStatisticsRepository } from '../domains/statistics/statistics-repository.js';
import { createStatisticsService } from '../domains/statistics/statistics-service.js';
import { createTextRepository } from '../domains/texts/text-repository.js';
import { createTextService } from '../domains/texts/text-service.js';
import { createTopicRepository } from '../domains/words/topic-repository.js';
import { createWordRepository } from '../domains/words/word-repository.js';
import { createWordService } from '../domains/words/word-service.js';

export function createDomainServices({ database, changeEventBus, clock }) {
  const runInTransaction = createTransactionRunner({ database });
  const sharedDependencies = { runInTransaction, changeEventBus, clock };

  const sectionService = createSectionService({ sectionRepository: createSectionRepository({ database }) });
  const wordService = createWordService({
    wordRepository: createWordRepository({ database }),
    topicRepository: createTopicRepository({ database }),
    sectionService,
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
    ...sharedDependencies,
  });
  const textService = createTextService({
    textRepository: createTextRepository({ database }),
    sectionService,
    ...sharedDependencies,
  });
  const statisticsService = createStatisticsService({
    statisticsRepository: createStatisticsRepository({ database }),
  });
  const artifactExportService = createArtifactExportService({
    artifactExportRepository: createArtifactExportRepository({ database }),
    ruleService,
    wordService,
    clock,
  });
  const artifactImportService = createArtifactImportService({
    artifactImportRepository: createArtifactImportRepository({ database }),
    sectionService,
    wordService,
    ...sharedDependencies,
  });

  return Object.freeze({
    wordService,
    ruleService,
    mistakeService,
    phraseService,
    textService,
    statisticsService,
    artifactExportService,
    artifactImportService,
  });
}
