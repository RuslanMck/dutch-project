// Contracts for the word-order exercise: sentences (added by hand, by import or generated), answers and the set.
import { z } from 'zod';

import { normalizeRule } from '../domains/word-order/word-order-tiles.js';
import { identifierParameterSchema, identifierSchema } from './shared-contracts.js';

const MAXIMUM_SENTENCE_LENGTH = 1000;
const MAXIMUM_TILE_LENGTH = 100;

export const wordOrderPathParametersSchema = z.object({ id: identifierParameterSchema });

// One sentence. An invalid one (blank, too short or long, digits) is skipped by the service, not refused here.
export const sentenceInputSchema = z.object({
  nl: z.string().max(MAXIMUM_SENTENCE_LENGTH).describe('the Dutch sentence, 4 to 9 words recommended (3 to 12 accepted), '
    + 'ends with . or ?'),
  uk: z.string().max(MAXIMUM_SENTENCE_LENGTH).describe('the Ukrainian translation'),
  // Any value is accepted: a rule that is not one of the eight (or not text) becomes null, so it never fails the call.
  rule: z.unknown().transform(normalizeRule).describe('the word-order rule: v2, inversion, question, modal, separable, '
    + 'negation, subordinate or perfect; null when none fits'),
});

export const addSentencesInputSchema = z.object({
  sentences: z.array(sentenceInputSchema).min(1).max(200),
});

export const answerInputSchema = z.object({
  tiles: z.array(z.string().min(1).max(MAXIMUM_TILE_LENGTH)).min(1).max(20)
    .describe('the words in the order the learner put them'),
});

export const checkWordOrderToolInputSchema = answerInputSchema.extend({
  id: identifierSchema.describe('id of the sentence, from get_word_order_set'),
});

export const importInputSchema = z.object({
  markdown: z.string().min(1).max(200000),
});

export const generateInputSchema = z.object({
  count: z.number().int().min(5).max(30).optional().describe('how many sentences to make, default 20'),
});

export const listSentencesInputSchema = z.object({
  limit: z.number().int().min(1).max(5000).optional().describe('default 100'),
});
