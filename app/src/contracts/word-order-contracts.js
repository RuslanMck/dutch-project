// Contracts for the word-order exercise: sentences (added by hand, by import or generated), answers and the set.
import { z } from 'zod';

import { normalizeRule } from '../domains/word-order/word-order-tiles.js';
import { identifierParameterSchema, identifierSchema } from './shared-contracts.js';

const MAXIMUM_SENTENCE_LENGTH = 1000;
const MAXIMUM_TILE_LENGTH = 100;
const MAXIMUM_ALTERNATIVE_ORDERS = 5;
const MAXIMUM_WRONG_FORMS = 5;
const WRONG_FORMS_DESCRIPTION = 'single words that look like a word of the sentence but are wrong in it, shown as '
  + 'extra tiles: another form of a sentence word (verb person or tense, adjective with or without -e, singular or '
  + 'plural, het for a de-word or de for a het-word). Each must make the sentence wrong wherever it goes: never a '
  + 'word that could replace one in a correct sentence (wij for we, een for het). Not a word of the sentence; at most 5';

export const wordOrderPathParametersSchema = z.object({ id: identifierParameterSchema });

// One sentence. An invalid one (blank, too short or long, digits) is skipped by the service, not refused here.
export const sentenceInputSchema = z.object({
  nl: z.string().max(MAXIMUM_SENTENCE_LENGTH).describe('the Dutch sentence, 4 to 9 words recommended (3 to 12 accepted), '
    + 'ends with . or ?'),
  uk: z.string().max(MAXIMUM_SENTENCE_LENGTH).describe('the Ukrainian translation'),
  // Any value is accepted: a rule that is not one of the eight (or not text) becomes null, so it never fails the call.
  rule: z.unknown().transform(normalizeRule).describe('the word-order rule: v2, inversion, question, modal, separable, '
    + 'negation, subordinate or perfect; null when none fits'),
  // Any value is accepted: a structure that does not fit the sentence is dropped with a warning, never a failed call.
  structure: z.unknown().optional().describe('optional schema: the Dutch sentence split into ordered segments, each '
    + '{ "text": "...", "role": "..." }; the texts joined by spaces are exactly the sentence words in order; roles such as '
    + 'підмет, дієслово, модальне дієслово, допоміжне дієслово, інфінітив, дієприкметник, відокремлювана частина, '
    + 'додаток, прикметник, час, місце, спосіб, причина, заперечення, сполучник, питальне слово, частка. Example for '
    + '"Deze week ben ik jarig.": [{"text":"Deze week","role":"час"},{"text":"ben","role":"дієслово"},{"text":"ik","role":"підмет"},'
    + '{"text":"jarig","role":"прикметник"}]'),
  // Any value is accepted: an alternative that is not valid (other words, a duplicate, a broken schema) skips the
  // sentence with a reason, never a failed call.
  alt_orders: z.unknown().optional().describe('optional: the other natural word orders of the sentence, a list of '
    + 'strings. Each uses exactly the same words and the same schema segments (the segments may come in another order); not the '
    + 'same order with other capitals or punctuation. Example: nl "Ik neem een drankje omdat ik dorst heb." with '
    + 'alt_orders ["Omdat ik dorst heb, neem ik een drankje."]. Leave it out when there is only one order.'),
  // Any value is accepted: a bad wrong form is dropped with a warning, never a failed call.
  wrong_forms: z.unknown().optional().describe(`optional, recommended: ${WRONG_FORMS_DESCRIPTION}. Example: nl "Wij gaan `
    + 'morgen naar de markt." with wrong_forms ["gaat", "ga", "het"]. Without them the extra tiles are random words.'),
});

export const addSentencesInputSchema = z.object({
  sentences: z.array(sentenceInputSchema).min(1).max(200),
});

// Changes one saved sentence. Absent fields stay as they are; rule and structure accept null to clear them. The service
// refuses a bad value (ValidationError) rather than dropping it.
export const updateSentenceInputSchema = z.object({
  uk: z.string().max(MAXIMUM_SENTENCE_LENGTH).optional().describe('the Ukrainian translation'),
  rule: z.unknown().optional().describe('the rule (v2, inversion, question, modal, separable, negation, subordinate, '
    + 'perfect), or null to clear it'),
  structure: z.unknown().optional().describe('the schema: an array of { text, role } as in add_sentences, or null to '
    + 'clear it'),
  alt_orders: z.array(z.string().max(MAXIMUM_SENTENCE_LENGTH)).max(MAXIMUM_ALTERNATIVE_ORDERS).optional()
    .describe('the other natural word orders (strings, at most 5), with the same words and schema segments as the '
      + 'sentence; [] clears them. Checked against the sentence and its schema, a bad one is an error.'),
  wrong_forms: z.array(z.string().max(MAXIMUM_TILE_LENGTH)).max(MAXIMUM_WRONG_FORMS).optional()
    .describe(`the wrong forms: ${WRONG_FORMS_DESCRIPTION}; [] clears them. A bad one is an error.`),
});

export const updateSentenceToolInputSchema = updateSentenceInputSchema.extend({
  id: identifierSchema.describe('id of the sentence, from list_sentences'),
});

// The rules to practise: names and/or 'none'. Absent, empty or with no valid name = all sentences.
export const getSetInputSchema = z.object({
  rules: z.array(z.string().max(40)).optional().describe('only these rules: v2, inversion, question, modal, separable, '
    + 'negation, subordinate, perfect, or none (sentences without a rule); absent, empty or only unknown names = all rules'),
});

export const sentenceSetQuerySchema = z.object({
  rules: z.union([z.string(), z.array(z.string())]).optional(),
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
