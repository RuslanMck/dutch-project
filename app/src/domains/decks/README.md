# decks

Custom decks («Колоди»): named lists of words the learner drills on their own. A deck never changes a word's schedule.
The word catalog for the deck picker is here too: each word with its answer totals, difficulty and last practice day.

## Files

| File | What it does |
|---|---|
| `deck-repository.js` | SQL for `custom_decks` and `custom_deck_words`, and the catalog with the totals of `deck_answers` (counting answers only). |
| `deck-service.js` | Create, read, update and delete decks (names unique ignoring case, unknown word ids refused, a deck keeps at least one word), the catalog's difficulty and last practice day. Publishes `decks`. |
| `deck-routes.js` | REST adapter: `/api/decks…` and `/api/decks/word-catalog`. |
| `deck-tools.js` | MCP adapter: `list_decks`, `get_deck`, `create_deck`, `update_deck`, `delete_deck` (destructive). |
