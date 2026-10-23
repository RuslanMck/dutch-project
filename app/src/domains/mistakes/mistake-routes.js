// REST adapter for mistake patterns and cases, mounted under /api: parses the request with the contracts and calls
// the mistake service.
import express from 'express';

import {
  addMistakeCaseInputSchema,
  createMistakePatternInputSchema,
  listMistakePatternsQuerySchema,
  logMistakeInputSchema,
  mistakeCasePathParametersSchema,
  mistakePatternPathParametersSchema,
} from '../../contracts/mistake-contracts.js';
import { readRequestBody, removeBlankQueryValues } from '../../http/request-input.js';

export function createMistakeRoutes({ mistakeService }) {
  const mistakeRouter = express.Router();

  // ?rule= is a short alias of ?rule_code=.
  mistakeRouter.get('/mistake-patterns', (request, response) => {
    const patternFilter = removeBlankQueryValues({
      rule_id: request.query.rule_id,
      rule_code: request.query.rule_code ?? request.query.rule,
    });
    response.json(mistakeService.listPatterns(listMistakePatternsQuerySchema.parse(patternFilter)));
  });

  mistakeRouter.get('/mistake-patterns/:id', (request, response) => {
    response.json(mistakeService.getPattern(mistakePatternPathParametersSchema.parse(request.params).id));
  });

  mistakeRouter.post('/mistake-patterns', (request, response) => {
    const patternInput = createMistakePatternInputSchema.parse(readRequestBody(request));
    response.status(201).json(mistakeService.createPattern(patternInput));
  });

  mistakeRouter.delete('/mistake-patterns/:id', (request, response) => {
    mistakeService.deletePattern(mistakePatternPathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  mistakeRouter.post('/mistake-patterns/:id/cases', (request, response) => {
    const { id } = mistakePatternPathParametersSchema.parse(request.params);
    response.json(mistakeService.addMistakeCase(id, addMistakeCaseInputSchema.parse(readRequestBody(request))));
  });

  mistakeRouter.delete('/mistake-cases/:id', (request, response) => {
    mistakeService.deleteMistakeCase(mistakeCasePathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  mistakeRouter.post('/mistakes/log', (request, response) => {
    response.json(mistakeService.logMistake(logMistakeInputSchema.parse(readRequestBody(request))));
  });

  return mistakeRouter;
}
