// Contracts for phrases (stable Dutch lines with their context).
import { z } from 'zod';

import {
  createNonEmptyTextSchema,
  createOptionalTextSchema,
  identifierParameterSchema,
} from './shared-contracts.js';

export const phrasePathParametersSchema = z.object({ id: identifierParameterSchema });

export const createPhraseInputSchema = z.object({
  nl: createNonEmptyTextSchema(),
  uk: createNonEmptyTextSchema(),
  context: createOptionalTextSchema(),
  section: createOptionalTextSchema(),
});

export const addPhrasesInputSchema = z.object({
  phrases: z.array(createPhraseInputSchema).min(1).max(1000),
});

export const listPhrasesInputSchema = z.object({
  limit: z.number().int().min(1).max(5000).optional().describe('default 100'),
});
