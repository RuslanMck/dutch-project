// Contracts for custom decks: create, read, update and delete, and the word picker's catalog. A deck's name is one
// text, unique ignoring case (the service checks it, so the message is in Ukrainian).
import { z } from 'zod';

import { identifierParameterSchema } from './shared-contracts.js';

const MAXIMUM_NAME_LENGTH = 80;
const MAXIMUM_DESCRIPTION_LENGTH = 500;
const MAXIMUM_WORD_IDS_PER_CALL = 1000;

export const deckPathParametersSchema = z.object({ id: identifierParameterSchema });

// A word id as a JSON number. A factory: one schema instance in several fields would become a JSON Schema "$ref".
function createWordIdSchema() {
  return z.number().int().positive().describe('word id, from list_words, search_words or get_struggling_words');
}

function createDeckNameSchema() {
  return z.string().trim().min(1, 'required').max(MAXIMUM_NAME_LENGTH, `at most ${MAXIMUM_NAME_LENGTH} characters`)
    .describe(`deck name, 1–${MAXIMUM_NAME_LENGTH} characters, unique ignoring case`);
}

function createDeckDescriptionSchema() {
  return z.string().trim().max(MAXIMUM_DESCRIPTION_LENGTH, `at most ${MAXIMUM_DESCRIPTION_LENGTH} characters`).nullish()
    .describe('optional note about the deck; empty or null means none');
}

export const createDeckInputSchema = z.object({
  name: createDeckNameSchema(),
  description: createDeckDescriptionSchema(),
  word_ids: z.array(createWordIdSchema()).min(1, 'a deck needs at least one word').max(MAXIMUM_WORD_IDS_PER_CALL)
    .describe('ids of the words in the deck, at least one; repeats are ignored'),
}).strict();

// An absent field is left alone. word_ids replaces the words; add_word_ids and remove_word_ids change them. word_ids
// cannot be combined with the other two (the service refuses it). A deck may not end with no words.
export const updateDeckInputSchema = z.object({
  name: createDeckNameSchema().optional(),
  description: createDeckDescriptionSchema(),
  word_ids: z.array(createWordIdSchema()).max(MAXIMUM_WORD_IDS_PER_CALL).optional()
    .describe('replaces every word of the deck with these ids (at least one)'),
  add_word_ids: z.array(createWordIdSchema()).max(MAXIMUM_WORD_IDS_PER_CALL).optional()
    .describe('words to add; a word already in the deck stays where it is'),
  remove_word_ids: z.array(createWordIdSchema()).max(MAXIMUM_WORD_IDS_PER_CALL).optional()
    .describe('words to remove; ids not in the deck are ignored'),
}).strict();

export const deckMcpIdSchema = z.number().int().positive().describe('deck id, from list_decks');
