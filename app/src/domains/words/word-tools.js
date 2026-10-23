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
    description: 'List dictionary words, oldest first (or by error count). '
      + 'Filters: status, topic, section (textbook chapter). Returns compact rows.',
    inputSchema: listWordsToolInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ status, topic, section, sort, limit }) => {
    const words = wordService.listWords({ status, topic, section, sort, limit: limit ?? DEFAULT_LIST_LIMIT });
    return words.map(mapWordToCompactWord);
  });

  registerJsonTool(mcpServer, 'add_words', {
    title: 'Add words',
    description: 'Add several dictionary words in one call. Words are created with status "new" unless given. '
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
      + 'Changing nl re-detects kind unless kind is given.',
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
    description: 'Set a word to new, learning or learned.',
    inputSchema: { id: identifierSchema, ...setWordStatusInputSchema.shape },
  }, ({ id, status }) => mapWordToCompactWord(wordService.updateWordStatus(id, status)));

  registerJsonTool(mcpServer, 'log_word_error', {
    title: 'Log word error',
    description: 'Record that a word was got wrong: adds one error and sets the word to "learning". '
      + 'Give id, or nl (exact, case-insensitive; article helps choose between homographs). '
      + 'If no word matches, one is created from nl, uk (required then), article, section and status "learning", '
      + 'and the error is logged on it. '
      + 'Returns {word, created}.',
    inputSchema: logWordErrorByLookupInputSchema.shape,
  }, lookupInput => {
    const { word, created } = wordService.logWordErrorByLookup(lookupInput);
    return { word: mapWordToCompactWord(word), created };
  });
}

// The shape returned to Claude for words: enough to act on, without timestamps or legacy ids.
function mapWordToCompactWord(word) {
  return {
    id: word.id,
    nl: word.nl,
    uk: word.uk,
    article: word.article,
    kind: word.kind,
    section: word.section,
    topic: word.topic,
    status: word.status,
    error_count: word.error_count,
    example_nl: word.example_nl,
    example_uk: word.example_uk,
  };
}
