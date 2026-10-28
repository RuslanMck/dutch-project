// MCP adapter for the word-order exercise: registers the six word-order tools.
import {
  addSentencesInputSchema,
  checkWordOrderToolInputSchema,
  generateInputSchema,
  listSentencesInputSchema,
} from '../../contracts/word-order-contracts.js';
import { identifierSchema } from '../../contracts/shared-contracts.js';
import {
  DELETED_TOOL_RESULT,
  DESTRUCTIVE_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  registerJsonTool,
} from '../../model-context-protocol/mcp-tool-registration.js';

const DEFAULT_LIST_LIMIT = 100;

export function registerWordOrderTools({ mcpServer, wordOrderService }) {
  registerJsonTool(mcpServer, 'add_sentences', {
    title: 'Add word-order sentences',
    description: 'Add Dutch sentences for the word-order exercise. Rules for each sentence: level A1-A2; 4 to 9 words '
      + '(3 to 12 accepted); at least one of the learner\'s learning or learned words (list_words); spread over the rules '
      + 'v2, inversion, question, modal, separable, negation, subordinate and perfect; exactly one natural word order; no '
      + 'commas, digits or names; ends with . or ?; rule is one of these names or null. Give a natural Ukrainian '
      + 'translation (not word by word). Call list_sentences first so nothing repeats. Show the sentences to the learner '
      + 'as a Markdown table (Українською, Nederlands, Правило) and save them only after the learner says yes. Repeats and '
      + 'invalid sentences are skipped and listed in skipped; the rest are added.',
    inputSchema: addSentencesInputSchema.shape,
  }, ({ sentences }) => wordOrderService.addSentences(sentences, { source: 'mcp' }));

  registerJsonTool(mcpServer, 'list_sentences', {
    title: 'List word-order sentences',
    description: 'Saved word-order sentences, newest first, with times_answered, times_correct and last_answered_at. '
      + 'Use it to avoid repeating a sentence.',
    inputSchema: listSentencesInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ limit }) => wordOrderService.listSentences({ limit: limit ?? DEFAULT_LIST_LIMIT }));

  registerJsonTool(mcpServer, 'delete_sentence', {
    title: 'Delete word-order sentence',
    description: 'Permanently delete one word-order sentence by id, with its answers.',
    inputSchema: { id: identifierSchema },
    annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
  }, ({ id }) => {
    wordOrderService.deleteSentence(id);
    return DELETED_TOOL_RESULT;
  });

  registerJsonTool(mcpServer, 'get_word_order_set', {
    title: 'Get word-order set',
    description: 'The next set of up to 10 sentences to practise: each has id, uk (the Ukrainian to show), rule and '
      + 'tiles (the shuffled Dutch words plus 2 or 3 extra words). The Dutch sentence is not returned.',
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, () => wordOrderService.getSentenceSet());

  registerJsonTool(mcpServer, 'check_word_order', {
    title: 'Check word-order answer',
    description: 'Record the learner\'s answer for one sentence: id and tiles, the words in the order they put them. '
      + 'Returns is_correct, correct_nl and correct_tiles. Does not change the FSRS schedule.',
    inputSchema: checkWordOrderToolInputSchema.shape,
  }, ({ id, tiles }) => wordOrderService.answerSentence({ id, tiles }));

  registerJsonTool(mcpServer, 'generate_sentences', {
    title: 'Generate word-order sentences',
    description: 'Ask the configured LLM (OpenRouter) for new sentences that use the learner\'s words, and save them. '
      + 'It can take up to a minute. Fails when OPENROUTER_API_KEY is not set.',
    inputSchema: generateInputSchema.shape,
  }, async ({ count }) => wordOrderService.generateSentences({ count }));
}
