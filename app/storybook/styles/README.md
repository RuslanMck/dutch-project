# styles

Stylesheets loaded into every story.

## Files

| File | What it does |
|---|---|
| `garden.css` | Component styles in the Сад look: the structure of `public/app.css` with `garden-*` tokens. Uses tokens only, no raw colours. |
| `stories.css` | Layout helpers for stories only (`.r`, `.col`, `.wide`). Never used by the app. |
| `tokens.css` | Generated from `tokens/tokens.json` by `scripts/build-tokens.js`; git-ignored. Don't edit. |
