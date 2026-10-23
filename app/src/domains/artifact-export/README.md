# artifact-export

The claude.ai artifact's JSON format (`dutch-export.json`): exporting all data in it, and importing an export idempotently (rows are matched by `legacy_id`).

## Files

| File | What it does |
|---|---|
| `artifact-export-repository.js` | Read queries for mistake patterns, cases, phrases and texts in export order. |
| `artifact-export-service.js` | Builds the export (words and rules through their services) and its file name. |
| `artifact-import-repository.js` | SQL for the import: insert-or-update by `legacy_id` (only changed columns), legacy error rows, mistake cases and row counts. |
| `artifact-import-service.js` | Runs the import in one transaction: sections, rules, words with legacy error counts, phrases, texts, mistake patterns and cases. Publishes every collection. |
| `artifact-import-mapping.js` | Pure mapping of export fields: rule topic → code and category, example → Dutch and Ukrainian, date → timestamp. |
| `import-report-formatting.js` | Formats the plain-text import report: duplicate words and data issues. Pure. |
