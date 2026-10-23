# sections

Textbook sections (such as `6.1`) that rules, words, phrases and texts refer to. They are created on demand; codes starting with `Д` are the learner's own rules, not textbook sections.

## Files

| File | What it does |
|---|---|
| `section-repository.js` | SQL for `sections`: insert when missing. |
| `section-service.js` | `ensureSection`: creates the section if needed and marks whether it is from the textbook. |
