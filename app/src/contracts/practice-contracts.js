// Contracts for the practice: the batch, grading words and phrases, extra new words, chapter and priorities, the
// frequency list and the migration.
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
const MAXIMUM_EXTRA_NEW_WORD_COUNT = 50;
const REVIEW_LIMIT_DESCRIPTION = 'most overdue reviews to return; default all due reviews';
const PREVIEW_CHAPTER_DESCRIPTION = 'chapter to preview; default the current chapter';

// The article is optional in translation practice: a missing or wrong de/het does not change the grade.
export const practiceGradeSchema = z.enum(PRACTICE_GRADE_VALUES).describe(
  "'good' right word, article optional (a missing or wrong de/het still counts as good); 'hard' right word with a "
  + "spelling slip, or a correct Dutch synonym; 'again' wrong, or the learner did not know it (DNK)",
);

// Phrases are graded by the learner as well as by Claude, so the grade is described for either side.
export const phraseGradeSchema = practiceGradeSchema.describe(
  "'good' fully right; 'hard' right phrase with a slip; 'again' wrong, or the learner did not know it",
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

// A phrase has no article or answer text, so its grade takes no answer field.
const gradePhraseFieldsSchema = z.object({
  grade: phraseGradeSchema,
  session_id: practiceSessionIdSchema,
});

export const gradePhraseToolInputSchema = gradePhraseFieldsSchema.extend({
  id: identifierSchema.describe('phrase id, from get_phrase_batch'),
}).strict();

export const gradePhraseInputSchema = gradePhraseFieldsSchema.extend({
  phrase_id: identifierSchema.describe('phrase id, from the phrase batch'),
}).strict();

// REST body and MCP arguments of addExtraNewWords: the number of extra new words for today, default 10.
export const addExtraNewWordsInputSchema = z.object({
  count: z.number().int().min(1).max(MAXIMUM_EXTRA_NEW_WORD_COUNT).default(10)
    .describe('how many extra new words to add for today, 1 to 50; default 10'),
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

export const resetPracticeInputSchema = z.object({
  dry_run: z.boolean().optional()
    .describe('default true: only report the counts and write nothing; false resets every word and phrase to New'),
}).strict();

export const migrateToFsrsInputSchema = z.object({
  dry_run: z.boolean().optional()
    .describe('default true: only report the counts and write nothing; false performs the one-time migration'),
}).strict();
