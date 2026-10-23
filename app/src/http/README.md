# http

Helpers shared by the REST route adapters in `domains/*/…-routes.js`. No routes live here.

## Files

| File | What it does |
|---|---|
| `request-input.js` | Reads a request's body (empty object when missing) and drops blank query values, before a route parses them with a contract. |
| `rest-error-handler.js` | The one REST error middleware: `ValidationError` and `ZodError` → 400, `NotFoundError` → 404, `ConflictError` → 409, anything else → 500 (logged), always `{ "error": message }`. |
