// MCP adapter for the word-order exercise: registers the six word-order tools.
import {
  addSentencesInputSchema,
  checkWordOrderToolInputSchema,
  generateInputSchema,
  getSetInputSchema,
  listSentencesInputSchema,
  updateSentenceToolInputSchema,
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
      + 'v2, inversion, question, modal, separable, negation, subordinate and perfect; no commas in the sentence itself (nl; '
      + 'an alternative order may have a comma after a fronted clause); no digits or names; ends with '
      + '. or ?; rule is one of these names or null. The sentence itself is its most neutral natural word order. Give a '
      + 'natural Ukrainian translation (not word by word). Give each sentence a structure: its words split into ordered '
      + 'segments, each with a role (the list: підмет, дієслово, модальне дієслово, допоміжне дієслово, інфінітив, '
      + 'дієприкметник, відокремлювана частина, додаток, прикметник, час, місце, спосіб, причина, заперечення, сполучник, '
      + 'питальне слово, частка), e.g. [{"text":"Deze week","role":"час"},{"text":"ben","role":"дієслово"},'
      + '{"text":"ik","role":"підмет"},{"text":"jarig","role":"прикметник"}] for "Deze week ben ik jarig."; the texts '
      + 'joined by spaces must be exactly the sentence words in order. Give alt_orders when another word order is also '
      + 'natural, e.g. nl "Ik neem een drankje omdat ik dorst heb." with alt_orders ["Omdat ik dorst heb, neem ik een '
      + 'drankje."]: a list of the other orders as strings, each with exactly the same words (case and punctuation may '
      + 'differ) and the same schema segments, which may come in another order; no order twice; at most 5. Call '
      + 'list_sentences first so nothing repeats. Show the sentences to the learner as a Markdown table (Українською, '
      + 'Nederlands, Правило, Схема, Інші порядки) and save them only after the learner says yes. Repeats and invalid '
      + 'sentences are skipped and listed in skipped (a bad alternative skips its sentence with the reason); a bad '
      + 'structure is dropped with a warning; a repeat whose saved sentence has no structure gets this one (updated) when '
      + 'its saved alternatives still fit it; a repeat\'s alt_orders are ignored (warning) when the saved sentence has some '
      + '(update_sentence changes them).',
    inputSchema: addSentencesInputSchema.shape,
  }, ({ sentences }) => wordOrderService.addSentences(sentences, { source: 'mcp' }));

  registerJsonTool(mcpServer, 'list_sentences', {
    title: 'List word-order sentences',
    description: 'Saved word-order sentences, newest first, with times_answered, times_correct, last_answered_at and '
      + 'structure (null when none yet). Use it to avoid repeating a sentence, and to find sentences without a structure '
      + 'to give one with update_sentence.',
    inputSchema: listSentencesInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ limit }) => wordOrderService.listSentences({ limit: limit ?? DEFAULT_LIST_LIMIT }));

  registerJsonTool(mcpServer, 'update_sentence', {
    title: 'Update word-order sentence',
    description: 'Change one saved sentence by id: uk, rule, structure and/or alt_orders. Give only the fields to change; '
      + 'null clears rule or structure, [] clears alt_orders. A structure must follow the add_sentences rules (segment '
      + 'texts joined by spaces = the Dutch words in order), and alt_orders must use the sentence\'s words and its schema '
      + 'segments, or the call fails; a new structure re-checks the saved alternatives. Use it to add a structure or '
      + 'alternative orders to sentences saved earlier (list_sentences shows structure null, and alt_orders).',
    inputSchema: updateSentenceToolInputSchema.shape,
  }, ({ id, ...changes }) => wordOrderService.updateSentence({ id, ...changes }));

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
    description: 'The next set of up to 10 sentences to practise: each has id, uk (the Ukrainian to show), rule, tiles (the '
      + 'shuffled Dutch words plus 2 or 3 extra words) and order_count (how many word orders are accepted, 1 when the '
      + 'sentence has only one). The Dutch sentence, its structure and its orders are not returned. rules (optional) limits '
      + 'the set to those rules, e.g. ["v2","none"]; an empty list or only unknown names mean all rules, as when it is left '
      + 'out. total counts the matching sentences and rule_counts counts all sentences per rule.',
    inputSchema: getSetInputSchema.shape,
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  }, ({ rules }) => wordOrderService.getSentenceSet({ rules }));

  registerJsonTool(mcpServer, 'check_word_order', {
    title: 'Check word-order answer',
    description: 'Record the learner\'s answer for one sentence: id and tiles, the words in the order they put them. The '
      + 'answer is right when it equals any accepted order (case and final punctuation ignored). Returns is_correct, '
      + 'correct_nl (the main order), correct_tiles, rule, structure (the schema to show after the answer, or null), '
      + 'matched_order (the index of the order it equals, 0 = the main one; -1 when wrong), orders (every accepted order as '
      + 'words joined by spaces, the main one first) and has_other_orders. Does not change the FSRS schedule.',
    inputSchema: checkWordOrderToolInputSchema.shape,
  }, ({ id, tiles }) => wordOrderService.answerSentence({ id, tiles }));

  registerJsonTool(mcpServer, 'generate_sentences', {
    title: 'Generate word-order sentences',
    description: 'Ask the configured LLM (OpenRouter) for new sentences that use the learner\'s words, and save them. Each '
      + 'comes with its structure and alt_orders (the other natural word orders; a bad one is dropped with a warning). It can '
      + 'take up to a minute. Fails when '
      + 'OPENROUTER_API_KEY is not set.',
    inputSchema: generateInputSchema.shape,
  }, async ({ count }) => wordOrderService.generateSentences({ count }));
}
