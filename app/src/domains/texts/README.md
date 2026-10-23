# texts

Bilingual texts such as textbook dialogues: one Dutch line, then its Ukrainian line, pairs separated by a blank line.

## Files

| File | What it does |
|---|---|
| `text-repository.js` | SQL for `texts`. |
| `text-service.js` | Create, change, list (newest first) and delete texts. Publishes `texts`. |
| `text-routes.js` | REST adapter: `/api/texts…`. |
| `text-tools.js` | MCP adapter: `add_text`, `list_texts` (without bodies), `get_text`. |
