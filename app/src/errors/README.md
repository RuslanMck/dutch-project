# errors

Domain errors shared by every layer. Services and repositories throw these (or let unexpected errors propagate); only adapters translate them, REST to status codes and MCP to `isError` results.

## Files

| File | What it does |
|---|---|
| `domain-errors.js` | `ValidationError` (bad input, REST 400), `NotFoundError` (REST 404), `ConflictError` (constraint failure, REST 409), and `mapToDomainError`, which turns a `ZodError` into a `ValidationError` listing every issue. |
