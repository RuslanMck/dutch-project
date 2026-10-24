// Zod building blocks shared by several domain contracts.
import { z } from 'zod';

export const LEARNING_STATUS_VALUES = Object.freeze(['new', 'learning', 'learned']);
export const ARTICLE_VALUES = Object.freeze(['', 'de', 'het']);
export const WORD_KIND_VALUES = Object.freeze(['word', 'expression']);
export const PRACTICE_MODE_VALUES = Object.freeze(['translate', 'article']);
export const MISTAKE_SOURCE_VALUES = Object.freeze(['exercise', 'lesson', 'practice']);
// FSRS card states, in the order of ts-fsrs's State enum (New = 0 … Relearning = 3).
export const CARD_STATE_VALUES = Object.freeze(['new', 'learning', 'review', 'relearning']);

export const learningStatusSchema = z.enum(LEARNING_STATUS_VALUES);
export const articleSchema = z.enum(ARTICLE_VALUES);
export const wordKindSchema = z.enum(WORD_KIND_VALUES);
export const practiceModeSchema = z.enum(PRACTICE_MODE_VALUES);
export const mistakeSourceSchema = z.enum(MISTAKE_SOURCE_VALUES);
export const cardStateSchema = z.enum(CARD_STATE_VALUES);

// A word priority, 1 is practised first, given as a JSON number (MCP arguments, JSON bodies).
export const wordPriorityValueSchema = z.number().int().min(1).max(3);

// The same priority given as text (REST query strings).
export const wordPriorityParameterSchema = z.coerce.number().int().min(1).max(3);

// A database id given as a JSON number (MCP arguments, JSON bodies).
export const identifierSchema = z.number().int().positive().describe('numeric id');

// A database id given as text (REST path parameters).
export const identifierParameterSchema = z.string()
  .regex(/^\d+$/, 'must be a positive integer')
  .transform(Number)
  .refine(value => Number.isSafeInteger(value) && value > 0, 'must be a positive integer');

export const calendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .refine(isRealCalendarDate, 'invalid date');

// The text building blocks are factories, not shared instances: when one schema object is used for two fields of
// the same MCP tool, its JSON Schema repeats it as a "$ref", which not every MCP client resolves.
export function createNonEmptyTextSchema() {
  return z.string().trim().min(1, 'required');
}

// In a patch, an absent field is left alone, and null or '' clears it.
export function createOptionalTextSchema() {
  return z.string().trim().nullish();
}

function isRealCalendarDate(text) {
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
