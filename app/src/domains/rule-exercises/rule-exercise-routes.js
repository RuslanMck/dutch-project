// REST adapter for the rule exercises, mounted under /api.
import express from 'express';

import {
  ruleExerciseAnswerInputSchema, ruleExercisePathParametersSchema, ruleExerciseSetInputSchema,
} from '../../contracts/rule-exercise-contracts.js';
import { readRequestBody } from '../../http/request-input.js';

export function createRuleExerciseRoutes({ ruleExerciseService }) {
  const ruleExerciseRouter = express.Router();

  ruleExerciseRouter.get('/rule-exercises/rules', (request, response) => {
    response.json(ruleExerciseService.listRuleOverview());
  });

  ruleExerciseRouter.post('/rule-exercises/sets', async (request, response) => {
    const { rule_ids: ruleIds, count } = ruleExerciseSetInputSchema.parse(readRequestBody(request));
    response.json(await ruleExerciseService.startSet({ ruleIds, count }));
  });

  ruleExerciseRouter.post('/rule-exercises/:id/answers', (request, response) => {
    const { id } = ruleExercisePathParametersSchema.parse(request.params);
    const { answer, skipped } = ruleExerciseAnswerInputSchema.parse(readRequestBody(request));
    response.json(ruleExerciseService.answerExercise({ id, answer, skipped }));
  });

  return ruleExerciseRouter;
}
