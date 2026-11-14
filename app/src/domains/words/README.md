# words

Dictionary words and expressions (one table), their errors, practice attempts, and the dictionary topics they are grouped by.

## Files

| File | What it does |
|---|---|
| `word-repository.js` | SQL for `words`, `word_errors` and `practice_attempts`; reads words with topic name, error count, priority, manual priority override, frequency rank and due time from `v_words`; filters by status, topic, priority and due time; sorts by added, errors, due or frequency. |
| `topic-repository.js` | SQL for `topics`: create on demand at the end of the order, and list with word counts. |
| `word-categorizer.js` | The categories of words through OpenRouter: 60 words per request, the answer checked (unknown ids and categories ignored), a background run after words are added (one at a time) and the run on demand. Injected client, so tests use a fake. |
| `word-service.js` | Word rules: kind detection, duplicate skipping on bulk add (new words are ranked for priority), field changes (a changed nl or section re-ranks the word), status (free before FSRS; after it only `new`, which clears the card), practice results (an attempt, and an error when wrong; the status never changes), word errors (an error only), the practice error of a wrong grade (`recordPracticeError`, written inside the practice's transaction and published by it), and lookup-or-create for MCP (created as `new`). Adds `state`, `next_due_on` and `priority_tag` ('first', 'later' or null) to each word, drops the card JSON, filters by state, sets the manual tag (`setWordPriorityTag`, REST `PUT /api/words/:id/priority`), and a word added from a later chapter makes that chapter current. Changes `category` (PATCH and `update_word`), starts the background categorizing after an add, and runs it on demand (`categorizeWords`). Publishes `words`. |
| `word-routes.js` | REST adapter: `/api/words…` and `/api/topics`. |
| `word-tools.js` | MCP adapter: `search_words`, `list_words`, `add_words`, `update_word`, `delete_word`, `set_word_status`, `log_word_error`; returns compact rows (see `compact-word-mapping.js`). |
| `compact-word-mapping.js` | Pure: the compact word that Claude sees from the word tools and from `set_word_priority`, without timestamps or legacy ids. |
| `expression-detection.js` | `detectWordKind`: three or more tokens, or a final `?` or `.`, make an expression. Pure. |
