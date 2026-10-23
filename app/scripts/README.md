# scripts

Command-line tools run by hand (`npm run import`, `docker compose run …`). They may read `process.argv` and files directly; the server never imports from here at run time.

## Files

| File | What it does |
|---|---|
| `import.js` | Idempotent import of a claude.ai artifact export (`dutch-export.json`) into the database, matched by `legacy_id`; writes `import-report.txt` with duplicates and data issues. |
