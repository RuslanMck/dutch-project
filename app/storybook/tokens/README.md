# tokens

The design tokens: the single source of truth for colour, type, spacing, radius, shadow and size.

## Files

| File | What it does |
|---|---|
| `tokens.json` | Every token with its value and a `usage` sentence. `garden-*` tokens are the Сад look (light-only); tokens whose usage starts with "App today:" describe the live app and are kept for reference. |

## Conventions

Add or change a token here, never in CSS. A new colour's `usage` says where it goes and which text may sit on it, with the contrast ratio.
