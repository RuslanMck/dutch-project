// MCP adapter for custom decks: registers the deck tools. A deck never changes a word's schedule.
import { createDeckInputSchema, deckMcpIdSchema, updateDeckInputSchema } from '../../contracts/deck-contracts.js';
import {
  DELETED_TOOL_RESULT,
  DESTRUCTIVE_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  registerJsonTool,
} from '../../model-context-protocol/mcp-tool-registration.js';

export function registerDeckTools({ mcpServer, deckService }) {
  registerJsonTool(mcpServer, 'list_decks', {
    title: 'List decks',
    description: 'Custom decks («Колоди»): named word lists the learner drills on their own, outside the schedule. '
      + 'Returns each deck with id, name, description, word_count, created_at and updated_at, newest change first.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => deckService.listDecks());

  registerJsonTool(mcpServer, 'get_deck', {
    title: 'Get deck',
    description: 'One deck with its words in the order added. Each word has id, nl, uk, article, section, status, '
      + 'difficulty (null when never answered), mistake_count, answer_count and last_practiced_on.',
    inputSchema: { id: deckMcpIdSchema },
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ id }) => deckService.getDeck(id));

  registerJsonTool(mcpServer, 'create_deck', {
    title: 'Create deck',
    description: 'Create a named deck of words (name 1–80 characters, unique ignoring case; word_ids at least one). '
      + 'Use it to collect words for extra drilling, e.g. the struggling words from get_struggling_words. A deck '
      + 'never changes any word\'s schedule.',
    inputSchema: createDeckInputSchema.shape,
  }, deckInput => deckService.createDeck(deckInput));

  registerJsonTool(mcpServer, 'update_deck', {
    title: 'Update deck',
    description: 'Change a deck: name, description (null or empty clears it), word_ids (replaces every word, at least '
      + 'one), add_word_ids or remove_word_ids. word_ids cannot be combined with add or remove. A deck keeps at least '
      + 'one word.',
    inputSchema: { id: deckMcpIdSchema, ...updateDeckInputSchema.shape },
  }, ({ id, ...deckChanges }) => deckService.updateDeck(id, deckChanges));

  registerJsonTool(mcpServer, 'delete_deck', {
    title: 'Delete deck',
    description: 'Permanently delete one deck by id. Its words stay in the database and keep their schedule.',
    inputSchema: { id: deckMcpIdSchema },
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ id }) => {
    deckService.deleteDeck(id);
    return DELETED_TOOL_RESULT;
  });
}
