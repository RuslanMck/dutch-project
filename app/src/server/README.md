# server

Composition: the place that knows every concrete implementation and wires them together. Modules elsewhere receive their dependencies and never build them.

## Files

| File | What it does |
|---|---|
| `create-domain-services.js` | Builds every repository and service on one database connection, change-event bus and clock. Used by the server, the import script and the tests. |
