// Contracts for bilingual texts (textbook dialogues).
import { z } from 'zod';

import { identifierParameterSchema, nonEmptyTextSchema, optionalTextSchema } from './shared-contracts.js';

export const textPathParametersSchema = z.object({ id: identifierParameterSchema });

// The body keeps its whitespace (line pairs are separated by blank lines), so it is checked, not trimmed.
const textBodySchema = z.string().refine(body => body.trim() !== '', 'required');

export const createTextInputSchema = z.object({
  title: nonEmptyTextSchema.describe('e.g. "Dialoog 6.1: In een restaurant"'),
  body: textBodySchema,
  section: optionalTextSchema.describe("textbook chapter code, e.g. '6.1'"),
});

export const updateTextInputSchema = createTextInputSchema.partial();
