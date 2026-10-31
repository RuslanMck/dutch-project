# fonts

Self-hosted web fonts, served at `/fonts/` before sign-in (the login page uses them) with a one-year immutable cache. The `@font-face` rules live in `storybook/styles/garden.css`, which generates `../app.css`.

## Files

| File | What it does |
|---|---|
| `manrope-cyrillic.woff2` | Manrope, variable 400–800, Cyrillic (Ukrainian, including ґ and є). Preloaded: most UI text is Ukrainian. |
| `manrope-latin.woff2` | Manrope, variable 400–800, Latin (Dutch text, numbers, punctuation). |
| `manrope-latin-ext.woff2` | Manrope, variable 400–800, Latin Extended. |
| `OFL.txt` | The SIL Open Font License 1.1 the font is distributed under. Keep it with the font files. |

## Conventions

One font for every script, so a line that mixes Ukrainian, Dutch and digits never switches font. The app uses three weights only (see `--garden-weight-*` in `storybook/tokens/tokens.json`). A font file's name never changes its contents; ship a new version under a new name so the long cache stays correct.
