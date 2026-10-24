// Contracts for the practice: the batch, grading, chapter and priorities, the frequency list and the migration.
// REST query values arrive as text, so their numbers are read with z.coerce.
import { z } from 'zod';

import {
  createNonEmptyTextSchema,
  createOptionalTextSchema,
  identifierSchema,
  wordPriorityValueSchema,
} from './shared-contracts.js';

export const PRACTICE_GRADE_VALUES = Object.freeze(['again', 'hard', 'good']);

const MAXIMUM_REVIEWS_PER_BATCH = 200;
const MAXIMUM_CHAPTER_NUMBER = 99;
const MAXIMUM_FREQUENCY_ENTRIES_PER_CALL = 20000;
const REVIEW_LIMIT_DESCRIPTION = 'most overdue reviews to return; default all due reviews';
const PREVIEW_CHAPTER_DESCRIPTION = 'chapter to preview; default the current chapter';

export const practiceGradeSchema = z.enum(PRACTICE_GRADE_VALUES).describe(
  "'good' fully right; 'hard' right word but wrong or missing article, a spelling slip or a synonym; "
  + "'again' wrong, or the learner did not know it (DNK)",
);

export const practiceSessionIdSchema = z.string().trim().min(1, 'required').max(100)
  .describe('id of this practice session; use the same value for every call in one session, e.g. a UUID');

const chapterNumberSchema = z.number().int().min(1).max(MAXIMUM_CHAPTER_NUMBER);

export const practiceBatchToolInputSchema = z.object({
  session_id: practiceSessionIdSchema,
  max_reviews: z.number().int().min(1).max(MAXIMUM_REVIEWS_PER_BATCH).optional().describe(REVIEW_LIMIT_DESCRIPTION),
}).strict();

export const practiceBatchQuerySchema = practiceBatchToolInputSchema.extend({
  max_reviews: z.coerce.number().int().min(1).max(MAXIMUM_REVIEWS_PER_BATCH).optional()
    .describe(REVIEW_LIMIT_DESCRIPTION),
}).strict();

const gradeWordFieldsSchema = z.object({
  grade: practiceGradeSchema,
  answer: createOptionalTextSchema().describe('the answer the learner typed; leave out when there is none'),
  session_id: practiceSessionIdSchema,
});

export const gradeWordToolInputSchema = gradeWordFieldsSchema.extend({
  id: identifierSchema.describe('word id, from get_practice_batch'),
}).strict();

export const gradeWordInputSchema = gradeWordFieldsSchema.extend({
  word_id: identifierSchema.describe('word id, from the practice batch'),
}).strict();

export const setCurrentChapterInputSchema = z.object({
  chapter: chapterNumberSchema.describe('textbook chapter the learner is on now, e.g. 7 for chapter 7'),
}).strict();

export const setWordPriorityInputSchema = z.object({
  id: identifierSchema.describe('word id, from list_words or get_practice_batch'),
  priority: wordPriorityValueSchema.nullable()
    .describe('1, 2 or 3 sets a manual priority that survives chapter changes; null clears it'),
}).strict();

export const frequencyEntrySchema = z.object({
  form: createNonEmptyTextSchema().describe('word form, e.g. "gaat"; matched case-insensitively'),
  rank: z.number().int().min(1).describe('frequency rank, 1 = most frequent'),
}).strict();

export const importFrequencyListInputSchema = z.object({
  entries: z.array(frequencyEntrySchema).min(1).max(MAXIMUM_FREQUENCY_ENTRIES_PER_CALL)
    .describe('frequency entries, at most 20000 per call'),
  replace_existing: z.boolean().optional()
    .describe('true replaces the whole frequency list with these entries; default false adds and updates only them'),
}).strict();

export const previewPrioritiesInputSchema = z.object({
  chapter: chapterNumberSchema.optional().describe(PREVIEW_CHAPTER_DESCRIPTION),
}).strict();

export const previewPrioritiesQuerySchema = previewPrioritiesInputSchema.extend({
  chapter: z.coerce.number().int().min(1).max(MAXIMUM_CHAPTER_NUMBER).optional()
    .describe(PREVIEW_CHAPTER_DESCRIPTION),
}).strict();

export const migrateToFsrsInputSchema = z.object({
  dry_run: z.boolean().optional()
    .describe('default true: only report the counts and write nothing; false performs the one-time migration'),
}).strict();
