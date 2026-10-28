# integrations

Outbound HTTP clients for third-party services. Each file exports a factory that takes its settings (the API key and
model come from `configuration/`) and a `fetchFunction`, so tests can replace the network.

| File | What it does |
|---|---|
| `openrouter-client.js` | `createOpenRouterClient({ apiKey, model, fetchFunction, timeoutMilliseconds })` → `{ isConfigured, completeChat(messages) }`. Asks for one JSON chat answer and returns its text. Errors never contain the API key. |
