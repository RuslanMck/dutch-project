// Contracts for mistake patterns and their cases.
import { z } from 'zod';

import {
  calendarDateSchema,
  identifierParameterSchema,
  identifierSchema,
  mistakeSourceSchema,
  nonEmptyTextSchema,
  optionalTextSchema,
} from './shared-contracts.js';

export const mistakePatternPathParametersSchema = z.object({ id: identifierParameterSchema });
export const mistakeCasePathParametersSchema = z.object({ id: identifierParameterSchema });

// rule_id: a number, or 'null' / 'other' for patterns outside the rules. rule_code: a code, or 'other'.
export const listMistakePatternsQuerySchema = z.object({
  rule_id: z.union([z.number().int(), z.string()]).nullish(),
  rule_code: nonEmptyTextSchema.optional().describe('e.g. "5.5", or "other"'),
});

export const createMistakePatternInputSchema = z.object({
  rule_id: z.number().int().nullish(),
  rule_code: optionalTextSchema,
  title: nonEmptyTextSchema,
  fix: optionalTextSchema,
});

export const addMistakeCaseInputSchema = z.object({
  wrong: nonEmptyTextSchema.describe('what the learner wrote'),
  right: nonEmptyTextSchema.describe('the correct form'),
  date: calendarDateSchema.nullish().describe('YYYY-MM-DD; default today'),
  source: mistakeSourceSchema.nullish(),
});

export const logMistakeInputSchema = addMistakeCaseInputSchema.extend({
  rule_code: optionalTextSchema.describe('rule code such as "5.5", or null when no rule fits'),
  pattern_id: z.number().int().nullish().describe('existing pattern to add this case to'),
  title: optionalTextSchema.describe('what went wrong, for a new pattern'),
  fix: optionalTextSchema.describe('one-line correct rule, for a new pattern'),
});

// MCP log_mistake: rule_code must be given (null when no rule fits), and the source defaults to 'exercise'.
export const logMistakeToolInputSchema = logMistakeInputSchema.extend({
  rule_code: nonEmptyTextSchema.nullable().describe('rule code such as "5.5", or null when no rule fits'),
  pattern_id: identifierSchema.nullish().describe('existing pattern to add this case to'),
  source: mistakeSourceSchema.nullish().describe("default 'exercise'"),
});
