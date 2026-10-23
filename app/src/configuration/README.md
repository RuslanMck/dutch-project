# configuration

Reads `process.env` once, at start-up, and turns it into a frozen configuration object that the composition root passes down. No other module reads the environment.

## Files

| File | What it does |
|---|---|
| `environment-configuration.js` | `parseEnvironmentConfiguration`: parses the environment with `environmentSchema` (blank values count as unset), requires `APP_PASSWORD`, `SESSION_SECRET` and `API_TOKEN` outside test mode, and returns the configuration. |
