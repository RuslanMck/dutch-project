// REST API under /api (mounted by server.js behind requireAuth). Each route parses its input with the shared
// contracts and calls a service; the services are passed in by the composition root.
import express from 'express';

import {
  addMistakeCaseInputSchema,
  createMistakePatternInputSchema,
  listMistakePatternsQuerySchema,
  logMistakeInputSchema,
  mistakeCasePathParametersSchema,
  mistakePatternPathParametersSchema,
} from './contracts/mistake-contracts.js';
import { createPhraseInputSchema, phrasePathParametersSchema } from './contracts/phrase-contracts.js';
import {
  createRuleInputSchema,
  rulePathParametersSchema,
  ruleReferencePathParametersSchema,
  updateRuleInputSchema,
} from './contracts/rule-contracts.js';
import { createTextInputSchema, textPathParametersSchema, updateTextInputSchema } from './contracts/text-contracts.js';
import {
  createWordInputSchema,
  listWordsQuerySchema,
  logWordErrorInputSchema,
  recordPracticeResultInputSchema,
  updateWordInputSchema,
  wordPathParametersSchema,
} from './contracts/word-contracts.js';
import { ConflictError, mapToDomainError, NotFoundError, ValidationError } from './errors/domain-errors.js';

const DELETED_RESPONSE = Object.freeze({ ok: true });
const SERVER_SENT_EVENTS_PING_INTERVAL_MILLISECONDS = 25_000;

export function createApiRouter({
  wordService,
  ruleService,
  mistakeService,
  phraseService,
  textService,
  statisticsService,
  artifactExportService,
  changeEventBus,
}) {
  const apiRouter = express.Router();
  apiRouter.use(express.json({ limit: '2mb' }));   // no-op when server.js already parsed the body

  apiRouter.get('/health', (request, response) => response.json({ ok: true }));

  // words
  apiRouter.get('/words', (request, response) => {
    response.json(wordService.listWords(listWordsQuerySchema.parse(removeBlankValues(request.query))));
  });
  apiRouter.post('/words', (request, response) => {
    response.status(201).json(wordService.createWord(createWordInputSchema.parse(readBody(request))));
  });
  apiRouter.patch('/words/:id', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    response.json(wordService.updateWord(id, updateWordInputSchema.parse(readBody(request))));
  });
  apiRouter.delete('/words/:id', (request, response) => {
    wordService.deleteWord(wordPathParametersSchema.parse(request.params).id);
    response.json(DELETED_RESPONSE);
  });
  apiRouter.post('/words/:id/result', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    response.json(wordService.recordPracticeResult(id, recordPracticeResultInputSchema.parse(readBody(request))));
  });
  apiRouter.post('/words/:id/errors', (request, response) => {
    const { id } = wordPathParametersSchema.parse(request.params);
    response.json(wordService.logWordError(id, logWordErrorInputSchema.parse(readBody(request))));
  });
  apiRouter.get('/topics', (request, response) => response.json(wordService.listTopics()));

  // rules
  apiRouter.get('/rules', (request, response) => response.json(ruleService.listRules()));
  apiRouter.post('/rules', (request, response) => {
    response.status(201).json(ruleService.createRule(createRuleInputSchema.parse(readBody(request))));
  });
  apiRouter.get('/rules/:id', (request, response) => {
    response.json(ruleService.getRule(ruleReferencePathParametersSchema.parse(request.params).id));
  });
  apiRouter.patch('/rules/:id', (request, response) => {
    const { id } = rulePathParametersSchema.parse(request.params);
    response.json(ruleService.updateRule(id, updateRuleInputSchema.parse(readBody(request))));
  });
  apiRouter.delete('/rules/:id', (request, response) => {
    ruleService.deleteRule(rulePathParametersSchema.parse(request.params).id);
    response.json(DELETED_RESPONSE);
  });

  // mistake patterns and cases
  apiRouter.get('/mistake-patterns', (request, response) => {
    const filter = removeBlankValues({
      rule_id: request.query.rule_id,
      rule_code: request.query.rule_code ?? request.query.rule,
    });
    response.json(mistakeService.listPatterns(listMistakePatternsQuerySchema.parse(filter)));
  });
  apiRouter.get('/mistake-patterns/:id', (request, response) => {
    response.json(mistakeService.getPattern(mistakePatternPathParametersSchema.parse(request.params).id));
  });
  apiRouter.post('/mistake-patterns', (request, response) => {
    response.status(201).json(mistakeService.createPattern(createMistakePatternInputSchema.parse(readBody(request))));
  });
  apiRouter.delete('/mistake-patterns/:id', (request, response) => {
    mistakeService.deletePattern(mistakePatternPathParametersSchema.parse(request.params).id);
    response.json(DELETED_RESPONSE);
  });
  apiRouter.post('/mistake-patterns/:id/cases', (request, response) => {
    const { id } = mistakePatternPathParametersSchema.parse(request.params);
    response.json(mistakeService.addMistakeCase(id, addMistakeCaseInputSchema.parse(readBody(request))));
  });
  apiRouter.delete('/mistake-cases/:id', (request, response) => {
    mistakeService.deleteMistakeCase(mistakeCasePathParametersSchema.parse(request.params).id);
    response.json(DELETED_RESPONSE);
  });
  apiRouter.post('/mistakes/log', (request, response) => {
    response.json(mistakeService.logMistake(logMistakeInputSchema.parse(readBody(request))));
  });

  // phrases
  apiRouter.get('/phrases', (request, response) => response.json(phraseService.listPhrases()));
  apiRouter.post('/phrases', (request, response) => {
    response.status(201).json(phraseService.createPhrase(createPhraseInputSchema.parse(readBody(request))));
  });
  apiRouter.delete('/phrases/:id', (request, response) => {
    phraseService.deletePhrase(phrasePathParametersSchema.parse(request.params).id);
    response.json(DELETED_RESPONSE);
  });

  // texts
  apiRouter.get('/texts', (request, response) => response.json(textService.listTexts()));
  apiRouter.get('/texts/:id', (request, response) => {
    response.json(textService.getText(textPathParametersSchema.parse(request.params).id));
  });
  apiRouter.post('/texts', (request, response) => {
    response.status(201).json(textService.createText(createTextInputSchema.parse(readBody(request))));
  });
  apiRouter.patch('/texts/:id', (request, response) => {
    const { id } = textPathParametersSchema.parse(request.params);
    response.json(textService.updateText(id, updateTextInputSchema.parse(readBody(request))));
  });
  apiRouter.delete('/texts/:id', (request, response) => {
    textService.deleteText(textPathParametersSchema.parse(request.params).id);
    response.json(DELETED_RESPONSE);
  });

  apiRouter.get('/stats', (request, response) => response.json(statisticsService.calculateStatistics()));

  apiRouter.get('/export', (request, response) => {
    response.attachment(artifactExportService.formatExportFileName());
    response.json(artifactExportService.exportCollections());
  });

  // Live updates: every service write publishes a change event, relayed here as server-sent events.
  apiRouter.get('/events', (request, response) => {
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.write(': connected\n\n');
    const unsubscribe = changeEventBus.subscribeToChanges(changeEvent => {
      response.write(`event: change\ndata: ${JSON.stringify(changeEvent)}\n\n`);
    });
    const pingInterval = setInterval(() => response.write(': ping\n\n'), SERVER_SENT_EVENTS_PING_INTERVAL_MILLISECONDS);
    request.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
      response.end();
    });
  });

  apiRouter.use((request, response) => response.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line no-unused-vars
  apiRouter.use((caughtError, request, response, next) => {
    if (response.headersSent) return next(caughtError);
    const error = mapToDomainError(caughtError);
    const statusCode = findStatusCode(error);
    if (statusCode >= 500) console.error(error);
    response.status(statusCode).json({ error: error.message });
  });

  return apiRouter;
}

const STATUS_CODE_BY_ERROR_TYPE = new Map([
  [ValidationError, 400],
  [NotFoundError, 404],
  [ConflictError, 409],
]);

// Domain errors map to 400/404/409. Errors from Express middleware (bad JSON, body too large) keep their status.
function findStatusCode(error) {
  for (const [ErrorType, statusCode] of STATUS_CODE_BY_ERROR_TYPE) {
    if (error instanceof ErrorType) return statusCode;
  }
  return Number.isInteger(error.status) ? error.status : 500;
}

function readBody(request) {
  return request.body ?? {};
}

// Query values that are missing or blank count as not given.
function removeBlankValues(query) {
  return Object.fromEntries(Object.entries(query ?? {}).filter(([, value]) => !isBlankValue(value)));
}

function isBlankValue(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}
