// REST adapter for grammar rules, mounted under /api: parses the request with the contracts and calls the rule
// service.
import express from 'express';

import {
  createRuleInputSchema,
  rulePathParametersSchema,
  ruleReferencePathParametersSchema,
  updateRuleInputSchema,
} from '../../contracts/rule-contracts.js';
import { readRequestBody } from '../../http/request-input.js';

export function createRuleRoutes({ ruleService }) {
  const ruleRouter = express.Router();

  ruleRouter.get('/rules', (request, response) => response.json(ruleService.listRules()));

  ruleRouter.post('/rules', (request, response) => {
    response.status(201).json(ruleService.createRule(createRuleInputSchema.parse(readRequestBody(request))));
  });

  // The path accepts a numeric id or a code such as 5.5.
  ruleRouter.get('/rules/:id', (request, response) => {
    response.json(ruleService.getRule(ruleReferencePathParametersSchema.parse(request.params).id));
  });

  ruleRouter.patch('/rules/:id', (request, response) => {
    const { id } = rulePathParametersSchema.parse(request.params);
    response.json(ruleService.updateRule(id, updateRuleInputSchema.parse(readRequestBody(request))));
  });

  ruleRouter.delete('/rules/:id', (request, response) => {
    ruleService.deleteRule(rulePathParametersSchema.parse(request.params).id);
    response.json({ ok: true });
  });

  return ruleRouter;
}
