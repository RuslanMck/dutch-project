# word-order

The word-order exercise («Порядок слів»): a Ukrainian sentence is shown, the Dutch words of its sentence lie shuffled
in a pile with 2 or 3 extra words, and the learner taps them into the right order. Answers are kept for choosing the
next sentences; they never change the FSRS schedule of words or phrases.

## Files

| File | What it does |
|---|---|
| `word-order-tiles.js` | Pure rules: the tiles of a sentence, the key that compares orders, the answer check, sentence validation, distractor choice and the shuffle, the schema (`normalizeStructure`, the roles), the alternative word orders (`normalizeAltOrders`, `listAcceptedOrders`, `findMatchingOrderIndex`) and the rule filter names. |
| `sentence-markdown.js` | Pure: reads the sentence table (`Українською`, `Nederlands`, optional `Правило`, `Схема`, `Інші порядки` and `Хибні форми`) of a Markdown file. |
| `sentence-generation-prompt.js` | Pure: the chat messages for the LLM (rules of `docs/SENTENCE_GENERATION_PROMPT.md`) and the reader of its JSON answer. |
| `word-order-repository.js` | SQL for `order_sentences`, `order_sentence_answers` and the vocabulary; the set is ordered here (last answer wrong, then never answered, then least recently answered). |
| `word-order-service.js` | Business rules: add (invalid and repeated sentences are skipped; a bad schema is a warning), import, generate through OpenRouter, list, update, delete, the set with shuffled tiles (no Dutch text, optional rule filter), the answer check against every accepted order (returns the rule, schema and orders). Publishes `word-order`. |
| `word-order-routes.js` | REST adapter: `/api/word-order/…`. |
| `word-order-tools.js` | MCP adapter: `add_sentences`, `list_sentences`, `update_sentence`, `delete_sentence`, `get_word_order_set`, `check_word_order`, `generate_sentences`. |

## Conventions

- Generation needs `OPENROUTER_API_KEY`; without it `generateSentences` throws a ValidationError (400 over REST).
  The service builds its OpenRouter client from the configuration passed to `createDomainServices`; tests without
  configuration get an unconfigured client.
- The set never carries the Dutch sentence; the answer response does.
