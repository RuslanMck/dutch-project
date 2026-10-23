# server

The composition root: the only place that knows every concrete implementation and wires them together, and the only place with start-up side effects. Modules elsewhere receive their dependencies and never build them.

## Files

| File | What it does |
|---|---|
| `start-server.js` | Entry point (`npm start`): parses the configuration, opens and migrates the database, builds services and application, listens on the port and starts the daily backups. |
| `create-application.js` | Builds the Express application: health check, `/mcp`, sign-in routes, the files the login page needs, then authentication, `/api` and the static app. No side effects. |
| `create-api-router.js` | Assembles `/api` from the domain routes, the live-update stream, a JSON 404 and the REST error handler. |
| `create-domain-services.js` | Builds every repository and service on one database connection, change-event bus and clock. Also used by the import script and the tests. |
