// Contracts for dictionary words: creating, changing, listing, searching, practice results and word errors.
import { z } from 'zod';

import {
  articleSchema,
  calendarDateSchema,
  cardStateSchema,
  createNonEmptyTextSchema,
  createOptionalTextSchema,
  identifierParameterSchema,
  identifierSchema,
  learningStatusSchema,
  mistakeSourceSchema,
  practiceModeSchema,
  wordKindSchema,
  wordPriorityParameterSchema,
  wordPriorityValueSchema,
} from './shared-contracts.js';

export const WORD_SORT_ORDER_VALUES = Object.freeze(['added', 'errors', 'due', 'frequency']);
export const wordSortOrderSchema = z.enum(WORD_SORT_ORDER_VALUES);

const MAXIMUM_WORDS_PER_CALL = 1000;
const MAXIMUM_WORD_LIST_LIMIT = 5000;

export const wordPathParametersSchema = z.object({ id: identifierParameterSchema });

export const createWordInputSchema = z.object({
  nl: createNonEmptyTextSchema().describe('Dutch text, e.g. "bestellen" or "hoe heet je?"'),
  uk: createNonEmptyTextSchema().describe('Ukrainian translation'),
  article: articleSchema.nullish().describe("'de', 'het' or '' for none"),
  example_nl: createOptionalTextSchema().describe('Dutch example sentence'),
  example_uk: createOptionalTextSchema().describe('Ukrainian translation of the example'),
  section: createOptionalTextSchema().describe("textbook chapter code, e.g. '6.1'"),
  topic: createOptionalTextSchema().describe('free-text dictionary topic, e.g. "У кафе"'),
  status: learningStatusSchema.nullish(),
  kind: wordKindSchema.nullish().describe('auto-detected when omitted'),
  err: z.number().int().min(0).max(100).nullish().describe('lesson errors to record on the new word'),
});

// Bulk add from MCP: lesson errors are logged separately there, so `err` is not accepted.
export const addWordsInputSchema = z.object({
  words: z.array(createWordInputSchema.omit({ err: true })).min(1).max(MAXIMUM_WORDS_PER_CALL),
  skip_existing: z.boolean().optional().describe('default true'),
});

export const createWordsInputSchema = z.array(createWordInputSchema).max(MAXIMUM_WORDS_PER_CALL);

export const updateWordInputSchema = createWordInputSchema
  .omit({ err: true, kind: true, status: true })
  .partial()
  .extend({
    kind: wordKindSchema.optional(),
    status: learningStatusSchema.optional(),
  });

export const setWordStatusInputSchema = z.object({ status: learningStatusSchema });

const wordListFilterSchema = z.object({
  status: learningStatusSchema.optional(),
  topic: createNonEmptyTextSchema().optional(),
  sort: wordSortOrderSchema.optional().describe(
    "'added' (default, oldest first), 'errors' (most errors first), 'due' (earliest due first, New words last) "
    + "or 'frequency' (most frequent first, unranked last)",
  ),
  state: cardStateSchema.optional().describe(
    'FSRS state. In practice only "new" (not in rotation) and "review" occur (long-term mode); '
    + 'learning progress is the status field',
  ),
  priority: wordPriorityValueSchema.optional().describe('1 is practised first, then 2, then 3'),
});

// REST: due_before is a timestamp in milliseconds.
export const listWordsQuerySchema = wordListFilterSchema.extend({
  priority: wordPriorityParameterSchema.optional(),
  due_before: z.coerce.number().int().nonnegative().optional()
    .describe('milliseconds: only words due before this time'),
  q: createNonEmptyTextSchema().optional(),
  limit: z.coerce.number().int().min(1).max(MAXIMUM_WORD_LIST_LIMIT).optional(),
});

// MCP: due_before is a calendar date in the practice time zone.
export const listWordsToolInputSchema = wordListFilterSchema.extend({
  section: createNonEmptyTextSchema().optional().describe("textbook chapter code, e.g. '6.1'"),
  due_before: calendarDateSchema.optional()
    .describe('YYYY-MM-DD: only words due before the start of that day (Amsterdam time)'),
  limit: z.number().int().min(1).max(MAXIMUM_WORD_LIST_LIMIT).optional().describe('default 100'),
});

export const searchWordsInputSchema = z.object({
  query: createNonEmptyTextSchema().describe('text to find in nl or uk'),
  limit: z.number().int().min(1).max(1000).default(20).describe('default 20'),
});

export const recordPracticeResultInputSchema = z.object({
  correct: z.boolean(),
  mode: practiceModeSchema,
  answer: createOptionalTextSchema(),
  wrong_answer: createOptionalTextSchema().describe('alias of answer'),
});

export const logWordErrorInputSchema = z.object({
  source: mistakeSourceSchema,
  wrong_answer: createOptionalTextSchema(),
  mode: practiceModeSchema.nullish(),
});

// Log an error on a word found by id or by Dutch text; the word is created when it is missing.
export const logWordErrorByLookupInputSchema = z.object({
  id: identifierSchema.optional(),
  nl: createNonEmptyTextSchema().optional(),
  uk: createNonEmptyTextSchema().optional()
    .describe('Ukrainian translation; needed only when the word must be created'),
  article: articleSchema.nullish(),
  source: mistakeSourceSchema.optional().describe("'exercise', 'lesson' (default) or 'practice'"),
  wrong_answer: createOptionalTextSchema().describe('what the learner wrote'),
  section: createOptionalTextSchema().describe('section for a newly created word'),
});
