// Contracts for phrases (stable Dutch lines with their context).
import { z } from 'zod';

import { identifierParameterSchema, nonEmptyTextSchema, optionalTextSchema } from './shared-contracts.js';

export const phrasePathParametersSchema = z.object({ id: identifierParameterSchema });

export const createPhraseInputSchema = z.object({
  nl: nonEmptyTextSchema,
  uk: nonEmptyTextSchema,
  context: optionalTextSchema,
  section: optionalTextSchema,
});

export const addPhrasesInputSchema = z.object({
  phrases: z.array(createPhraseInputSchema).min(1).max(1000),
});

export const listPhrasesInputSchema = z.object({
  limit: z.number().int().min(1).max(5000).optional().describe('default 100'),
});
