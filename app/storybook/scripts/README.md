# scripts

Build helpers for Storybook.

## Files

| File | What it does |
|---|---|
| `build-tokens.js` | Writes `styles/tokens.css` (CSS custom properties, light values) from `tokens/tokens.json`. Run by `npm run tokens`, `storybook` and `build`. |
| `build-app-css.js` | Writes the app's `public/app.css` from `styles/tokens.css` + `styles/garden.css`. Run by `npm run app-css`. |
