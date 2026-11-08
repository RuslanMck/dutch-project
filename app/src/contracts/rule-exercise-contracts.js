// Contracts for the rule exercises: starting a set and answering one exercise.
import { z } from 'zod';

import { identifierParameterSchema } from './shared-contracts.js';

const MAXIMUM_SET_SIZE = 20;
const MAXIMUM_ANSWER_LENGTH = 500;

export const ruleExercisePathParametersSchema = z.object({ id: identifierParameterSchema });

export const ruleExerciseSetInputSchema = z.object({
  rule_ids: z.array(z.number().int().positive()).max(200).optional()
    .describe('the rules to practise; all rules when left out'),
  count: z.number().int().min(1).max(MAXIMUM_SET_SIZE).default(10),
});

export const ruleExerciseAnswerInputSchema = z.object({
  answer: z.string().max(MAXIMUM_ANSWER_LENGTH).default(''),
  skipped: z.boolean().default(false).describe('«Не знаю»: counts as wrong'),
});
