# rules

Grammar rules. Their codes (such as `5.5` or `Д1`) are what feedback cites; codes are not unique, so a lookup by code takes the first rule in display order.

## Files

| File | What it does |
|---|---|
| `rule-repository.js` | SQL for `rules`, with the error count from `v_rule_errors`. |
| `rule-service.js` | Rule rules: lookup by id or code, default section (the code) and display order (after the last rule), changes and deletion. Publishes `rules`, and `mistakes` on delete. |
| `rule-routes.js` | REST adapter: `/api/rules…` (`GET /api/rules/:id` also accepts a code). |
| `rule-tools.js` | MCP adapter: `list_rules`, `get_rule` (with its mistake patterns), `add_rule`, `update_rule`. |
