# tokens

The design tokens: the single source of truth for colour, type, spacing, radius, shadow and size.

## Files

| File | What it does |
|---|---|
| `tokens.json` | Every token with its value and a `usage` sentence. `garden-*` tokens are the Сад look (light-only); tokens whose usage starts with "App today:" describe the live app and are kept for reference. `colorThemes` holds the colour themes picked in Налаштування: each lists the `garden-*` colours it changes. |

## Conventions

Add or change a token here, never in CSS. A new colour's `usage` says where it goes and which text may sit on it, with the contrast ratio.

A new colour theme goes in `colorThemes.list` with every colour the other themes list; `test/themes.test.js` in the app checks its contrast and that `public/index.html` offers it.
