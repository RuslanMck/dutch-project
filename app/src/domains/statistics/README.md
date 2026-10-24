# statistics

The statistics report: how many words there are by status and kind, and how big every other collection is. Read only.

## Files

| File | What it does |
|---|---|
| `statistics-repository.js` | Counting queries across the tables, the list of section codes, and every word's card and due time. |
| `statistics-service.js` | Builds the report returned by `GET /api/stats` and the MCP `stats` tool, including the FSRS state counts and the words due today (in the practice time zone). |
| `statistics-routes.js` | REST adapter: `GET /api/stats`. |
| `statistics-tools.js` | MCP adapter: the `stats` tool. |
