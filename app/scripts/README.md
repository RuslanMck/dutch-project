# scripts

Command-line tools run by hand (`npm run import`, `docker compose run …`). They may read `process.argv` and files directly; the server never imports from here at run time.

## Files

| File | What it does |
|---|---|
| `import.js` | CLI for the idempotent import of a claude.ai artifact export (`dutch-export.json`) into the database at `DB_PATH`. The artifact import service does the work; the script writes `import-report.txt` and prints the counts. Once FSRS practice is set up it stops with the service's `ConflictError` and writes nothing. |
| `import-frequency-list.js` | CLI for the frequency list: reads `form<TAB>rank` lines (blank and malformed lines are skipped), replaces `word_frequencies` and re-ranks every word and its priority, then prints the counts. Opens `DB_PATH`. |
