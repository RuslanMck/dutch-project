# statistics

The statistics report: how many words there are by status and kind, and how big every other collection is. Read only.

## Files

| File | What it does |
|---|---|
| `statistics-repository.js` | Counting queries across the tables, and the list of section codes. |
| `statistics-service.js` | Builds the report returned by `GET /api/stats` and the MCP `stats` tool. |
| `statistics-routes.js` | REST adapter: `GET /api/stats`. |
| `statistics-tools.js` | MCP adapter: the `stats` tool. |
