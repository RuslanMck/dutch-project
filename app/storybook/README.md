# Storybook — Сад components

> Agents: read the `storybook-maintenance` skill (`.claude/skills/storybook-maintenance/`) before any UI change. A UI change is not done until Storybook shows it.

The Dutch app's component library: tokens, every component, and the planned screens, in the Сад look. It is separate from the app (its own `package.json`), so it adds nothing to the app's image.

## Files

| File | What it does |
|---|---|
| `package.json` | Storybook dependencies and the `tokens`, `storybook` and `build` scripts. Separate from the app. |
| `package-lock.json` | Locked dependency versions. |
| `.gitignore` | Keeps `node_modules/`, `storybook-static/` and the generated `styles/tokens.css` out of git. |

## Layout

```
tokens/tokens.json        the design tokens (source of truth)
scripts/build-tokens.js   writes styles/tokens.css from tokens.json
styles/garden.css         component styles (structure from public/app.css, Сад colours)
styles/stories.css        layout helpers used only by stories
stories/foundations/      colour, type, radius, spacing and shadow pages, read from tokens.json
stories/components/<Name>/  <Name>.stories.js + README.md (guidelines shown on the Docs page)
stories/sketches/<Name>/    concept screens: .html + .css, rendered in a shadow root
```

## Run

There is no Node on the VPS host, so run it in a container:

```bash
docker run --rm -it -v "$PWD":/sb -w /sb -p 6006:6006 node:24-bookworm-slim sh -c "npm install && npm run storybook -- --host 0.0.0.0"
```

Static build into `storybook-static/`:

```bash
docker run --rm -v "$PWD":/sb -w /sb node:24-bookworm-slim sh -c "npm install && npm run build"
```

## Changing things

- **A token:** edit `tokens/tokens.json`. `npm run storybook` and `npm run build` regenerate `styles/tokens.css` first.
- **A component's look:** edit `styles/garden.css`.
- **A component's examples or guidelines:** edit `stories/components/<Name>/`.
- **A new component:** add `stories/components/<Name>/<Name>.stories.js` with `title: 'Components/<Group>/<Name>'` and a `README.md`.

The app's `public/app.css` is generated from here: run `npm run app-css` after changing tokens or `garden.css` (see the `storybook-maintenance` skill).
