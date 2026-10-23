# words

Dictionary words and expressions (one table), their errors, practice attempts, and the dictionary topics they are grouped by.

## Files

| File | What it does |
|---|---|
| `word-repository.js` | SQL for `words`, `word_errors` and `practice_attempts`; reads words with topic name and error count from `v_words`. |
| `topic-repository.js` | SQL for `topics`: create on demand at the end of the order, and list with word counts. |
| `word-service.js` | Word rules: kind detection, duplicate skipping on bulk add, field changes, practice results (learning → learned, wrong → learning), word errors, and lookup-or-create for MCP. Publishes `words`. |
| `expression-detection.js` | `detectWordKind`: three or more tokens, or a final `?` or `.`, make an expression. Pure. |
