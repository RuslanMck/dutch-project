# authentication

Who may use the app: the browser signs in with the password and gets a signed session cookie (180 days); scripts send `Authorization: Bearer <API_TOKEN>`. The MCP endpoint checks its own credentials in `model-context-protocol/mcp-routes.js`, using the comparison helpers here.

## Files

| File | What it does |
|---|---|
| `secret-comparison.js` | Constant-time comparison of secrets, and reading and checking a bearer token. |
| `session-cookie.js` | `createSessionCookie`: creates, verifies and reads the signed `dutch_session` cookie value (expiry plus HMAC; no server state). |
| `login-rate-limiter.js` | `createLoginRateLimiter`: refuses logins from an address after 10 failures within 15 minutes. |
| `authentication-routes.js` | `GET /login`, `POST /auth/login` and `POST /auth/logout`. |
| `require-authentication.js` | Middleware: lets a request through with a valid cookie or bearer token; otherwise `/api/*` gets 401 JSON and pages redirect to `/login`. |
