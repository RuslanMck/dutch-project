# phrases

Stable Dutch phrases (dialogue lines, shop talk) with the context they came from.

## Files

| File | What it does |
|---|---|
| `phrase-repository.js` | SQL for `phrases`: the rows, with their status and due time. |
| `phrase-service.js` | Add one phrase, add several in one transaction (all or none), list newest first with `status` and `next_due_on` (the day in the practice time zone, null while New), delete. Publishes `phrases`. |
| `phrase-routes.js` | REST adapter: `/api/phrases…`. |
| `phrase-tools.js` | MCP adapter: `add_phrases`, `list_phrases` (with `status` and `next_due_on`), `delete_phrase`. |
