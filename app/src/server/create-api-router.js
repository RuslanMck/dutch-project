// Assembles /api from the domain routes, the live-update stream, a JSON 404 and the one REST error handler.
import express from 'express';

import { createServerSentEventsRoutes } from '../change-events/server-sent-events-routes.js';
import { createArtifactExportRoutes } from '../domains/artifact-export/artifact-export-routes.js';
import { createMistakeRoutes } from '../domains/mistakes/mistake-routes.js';
import { createPhraseRoutes } from '../domains/phrases/phrase-routes.js';
import { createPracticeRoutes } from '../domains/practice/practice-routes.js';
import { createRuleRoutes } from '../domains/rules/rule-routes.js';
import { createStatisticsRoutes } from '../domains/statistics/statistics-routes.js';
import { createTextRoutes } from '../domains/texts/text-routes.js';
import { createWordOrderRoutes } from '../domains/word-order/word-order-routes.js';
import { createWordRoutes } from '../domains/words/word-routes.js';
import { createRestErrorHandler } from '../http/rest-error-handler.js';

export function createApiRouter({
  wordService,
  practiceService,
  phrasePracticeService,
  priorityService,
  ruleService,
  mistakeService,
  phraseService,
  wordOrderService,
  textService,
  statisticsService,
  artifactExportService,
  changeEventBus,
  logger = console,
}) {
  const apiRouter = express.Router();
  apiRouter.use(createWordRoutes({ wordService }));
  apiRouter.use(createPracticeRoutes({ practiceService, priorityService, phrasePracticeService }));
  apiRouter.use(createRuleRoutes({ ruleService }));
  apiRouter.use(createMistakeRoutes({ mistakeService }));
  apiRouter.use(createPhraseRoutes({ phraseService }));
  apiRouter.use(createWordOrderRoutes({ wordOrderService }));
  apiRouter.use(createTextRoutes({ textService }));
  apiRouter.use(createStatisticsRoutes({ statisticsService }));
  apiRouter.use(createArtifactExportRoutes({ artifactExportService }));
  apiRouter.use(createServerSentEventsRoutes({ changeEventBus }));
  apiRouter.use((request, response) => response.status(404).json({ error: 'not found' }));
  apiRouter.use(createRestErrorHandler({ logger }));
  return apiRouter;
}
