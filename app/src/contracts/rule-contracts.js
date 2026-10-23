// Contracts for grammar rules.
import { z } from 'zod';

import {
  createNonEmptyTextSchema,
  createOptionalTextSchema,
  identifierParameterSchema,
} from './shared-contracts.js';

export const rulePathParametersSchema = z.object({ id: identifierParameterSchema });

// A rule is found by its numeric id or by its code, such as '5.5' or 'Д1'.
export const ruleReferenceSchema = z.union([z.number().int().positive(), z.string().min(1)]);

export const ruleReferencePathParametersSchema = z.object({ id: ruleReferenceSchema });

export const createRuleInputSchema = z.object({
  code: createNonEmptyTextSchema().describe('rule number shown to the learner, e.g. "5.5" or "Д1"'),
  title: createNonEmptyTextSchema(),
  body: z.string().default(''),
  category: createOptionalTextSchema().describe('word class, e.g. "прикметник"'),
  sort_order: z.number().int().nullish().describe('ascending display order; default after the last rule'),
  section: createOptionalTextSchema().describe('textbook chapter code; defaults to the rule code'),
  legacy_id: createOptionalTextSchema(),
});

export const updateRuleInputSchema = createRuleInputSchema
  .omit({ body: true, legacy_id: true, sort_order: true })
  .partial()
  .extend({
    body: z.string().optional(),
    sort_order: z.number().int().optional(),
  });

// MCP add_rule: the body is required, and section and legacy_id are not offered.
export const createRuleToolInputSchema = createRuleInputSchema
  .omit({ legacy_id: true, section: true })
  .extend({ body: createRuleInputSchema.shape.body.removeDefault() });
