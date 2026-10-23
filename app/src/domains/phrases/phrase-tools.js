// MCP adapter for phrases: registers the phrase tools.
import { addPhrasesInputSchema, listPhrasesInputSchema } from '../../contracts/phrase-contracts.js';
import { identifierSchema } from '../../contracts/shared-contracts.js';
import {
  DELETED_TOOL_RESULT,
  DESTRUCTIVE_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  registerJsonTool,
} from '../../model-context-protocol/mcp-tool-registration.js';

const DEFAULT_LIST_LIMIT = 100;

export function registerPhraseTools({ mcpServer, phraseService }) {
  registerJsonTool(mcpServer, 'add_phrases', {
    title: 'Add phrases',
    description: 'Add stable Dutch phrases (dialogue lines, shop talk) in one call. '
      + 'context is the source, e.g. the dialogue name. All phrases are added or none are.',
    inputSchema: addPhrasesInputSchema.shape,
  }, ({ phrases }) => ({ added: phraseService.createPhrases(phrases) }));

  registerJsonTool(mcpServer, 'list_phrases', {
    title: 'List phrases',
    description: 'Phrases, newest first.',
    inputSchema: listPhrasesInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ limit }) => phraseService.listPhrases({ limit: limit ?? DEFAULT_LIST_LIMIT }));

  registerJsonTool(mcpServer, 'delete_phrase', {
    title: 'Delete phrase',
    description: 'Permanently delete one phrase by id.',
    inputSchema: { id: identifierSchema },
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ id }) => {
    phraseService.deletePhrase(id);
    return DELETED_TOOL_RESULT;
  });
}
