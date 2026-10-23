# mistakes

Recurring grammar-mistake patterns, each filed under a rule (or under none, "other"), and the concrete cases of each pattern.

## Files

| File | What it does |
|---|---|
| `mistake-repository.js` | SQL for `mistake_patterns` and `mistake_cases`; reads patterns with counts from `v_mistake_patterns` and attaches their cases, newest first. |
| `mistake-service.js` | Mistake rules: resolving the rule by id or code (through the rule service), reusing a pattern with the same rule and title, default case date (today). Publishes `mistakes`. |
