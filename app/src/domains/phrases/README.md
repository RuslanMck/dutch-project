# phrases

Stable Dutch phrases (dialogue lines, shop talk) with the context they came from.

## Files

| File | What it does |
|---|---|
| `phrase-repository.js` | SQL for `phrases`. |
| `phrase-service.js` | Add one phrase, add several in one transaction (all or none), list newest first, delete. Publishes `phrases`. |
| `phrase-routes.js` | REST adapter: `/api/phrases…`. |
| `phrase-tools.js` | MCP adapter: `add_phrases`, `list_phrases`, `delete_phrase`. |
