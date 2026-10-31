# fonts

Self-hosted web fonts, served at `/fonts/` before sign-in (the login page uses them) with a one-year immutable cache. The `@font-face` rules live in `storybook/styles/garden.css`, which generates `../app.css`.

## Files

| File | What it does |
|---|---|
| `plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans, variable 500–800, Latin (Dutch text, numbers, punctuation). |
| `plus-jakarta-sans-latin-ext.woff2` | Plus Jakarta Sans, variable 500–800, Latin Extended. |
| `OFL.txt` | The SIL Open Font License 1.1 the font is distributed under. Keep it with the font files. |

## Conventions

Plus Jakarta Sans has no basic Cyrillic, so Ukrainian text falls back to the next font in `--font-display`. A font file's name never changes its contents; ship a new version under a new name so the long cache stays correct.
