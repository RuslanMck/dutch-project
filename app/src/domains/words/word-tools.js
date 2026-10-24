// MCP adapter for words: registers the word tools. Arguments are parsed by the MCP SDK with the shared contracts;
// each tool calls the word service and returns compact rows.
import { identifierSchema } from '../../contracts/shared-contracts.js';
import {
  addWordsInputSchema,
  listWordsToolInputSchema,
  logWordErrorByLookupInputSchema,
  searchWordsInputSchema,
  setWordStatusInputSchema,
  updateWordInputSchema,
} from '../../contracts/word-contracts.js';
import {
  DELETED_TOOL_RESULT,
  DESTRUCTIVE_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  registerJsonTool,
} from '../../model-context-protocol/mcp-tool-registration.js';
import { mapWordToCompactWord } from './compact-word-mapping.js';

const DEFAULT_LIST_LIMIT = 100;

export function registerWordTools({ mcpServer, wordService }) {
  registerJsonTool(mcpServer, 'search_words', {
    title: 'Search words',
    description: 'Case-insensitive search on Dutch and Ukrainian text. Exact Dutch matches come first. '
      + 'Use before add_words to avoid duplicates.',
    inputSchema: searchWordsInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ query, limit }) => wordService.searchWords({ query, limit }).map(mapWordToCompactWord));

  registerJsonTool(mcpServer, 'list_words', {
    title: 'List words',
    description: 'List dictionary words, oldest first unless sorted. '
      + 'Sort: added (default), errors (most errors first), due (earliest due first, new words last), '
      + 'frequency (most frequent first, unranked last). '
      + 'Filters: status, topic, section (textbook chapter), state (FSRS: in practice only "new" and "review" occur; '
      + 'learning progress is the status field), priority (1-3, 1 is practised first), '
      + 'due_before (YYYY-MM-DD: due before the start of that day). '
      + 'Returns compact rows.',
    inputSchema: listWordsToolInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ status, topic, section, sort, state, priority, due_before: dueBeforeDate, limit }) => {
    const words = wordService.listWords({
      status,
      topic,
      section,
      sort,
      state,
      priority,
      dueBefore: dueBeforeDate === undefined ? undefined : wordService.calculateStartOfCalendarDay(dueBeforeDate),
      limit: limit ?? DEFAULT_LIST_LIMIT,
    });
    return words.map(mapWordToCompactWord);
  });

  registerJsonTool(mcpServer, 'add_words', {
    title: 'Add words',
    description: 'Add several dictionary words in one call. Once practice is set up on FSRS every word is created '
      + 'with status "new" (status is not taken from the input) and enters practice through the daily quota of new '
      + 'words, by priority. Before that, status is taken from the input, or "new". '
      + 'Priority comes from the textbook chapter and the frequency list. '
      + 'An entry whose nl and article match an existing word is skipped (reported in "skipped") '
      + 'unless skip_existing is false. '
      + 'Returns {added, skipped}.',
    inputSchema: addWordsInputSchema.shape,
  }, ({ words, skip_existing: shouldSkipExisting }) => {
    const { added, skipped } = wordService.createWords(words, { shouldSkipExisting: shouldSkipExisting ?? true });
    return { added: added.map(mapWordToCompactWord), skipped };
  });

  registerJsonTool(mcpServer, 'update_word', {
    title: 'Update word',
    description: 'Change fields of one word by id. Only the given fields change. '
      + 'Empty string or null clears example_nl, example_uk, section, topic. '
      + 'Changing nl re-detects kind unless kind is given. '
      + 'Once practice is set up on FSRS, status follows the schedule: only "new" is accepted, and it takes the word '
      + 'out of rotation (its schedule is cleared). Learning and learned come from grading in practice.',
    inputSchema: { id: identifierSchema, ...updateWordInputSchema.shape },
  }, ({ id, ...wordChanges }) => mapWordToCompactWord(wordService.updateWord(id, wordChanges)));

  registerJsonTool(mcpServer, 'delete_word', {
    title: 'Delete word',
    description: 'Permanently delete one word by id, with its error history.',
    inputSchema: { id: identifierSchema },
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ id }) => {
    wordService.deleteWord(id);
    return DELETED_TOOL_RESULT;
  });

  registerJsonTool(mcpServer, 'set_word_status', {
    title: 'Set word status',
    description: 'Set a word status. Once practice is set up on FSRS, status follows the schedule: only "new" is '
      + 'accepted, and it takes the word out of rotation (its schedule is cleared). Learning and learned come from '
      + 'grading in practice, not from here.',
    inputSchema: { id: identifierSchema, ...setWordStatusInputSchema.shape },
  }, ({ id, status }) => mapWordToCompactWord(wordService.updateWordStatus(id, status)));

  registerJsonTool(mcpServer, 'log_word_error', {
    title: 'Log word error',
    description: 'Record a mistake the learner made in an exercise or lesson: adds one error to the word and does not '
      + 'change its schedule or status. For a mistake in practice, use grade_word instead. '
      + 'Give id, or nl (exact, case-insensitive; article helps choose between homographs). '
      + 'If no word matches, one is created from nl, uk (required then), article and section with status "new", '
      + 'and the error is logged on it. '
      + 'Returns {word, created}.',
    inputSchema: logWordErrorByLookupInputSchema.shape,
  }, lookupInput => {
    const { word, created } = wordService.logWordErrorByLookup(lookupInput);
    return { word: mapWordToCompactWord(word), created };
  });
}
