---
name: storybook-maintenance
description: Use for any change that touches how the Dutch app looks or what it shows — public/index.html markup, public/app.css, public/app.js views, design tokens, a new or changed UI component or screen — and for any file under app/storybook/. Storybook (app/storybook) is the source of truth for the Сад components and tokens; this skill says how to keep it in sync in the same commit, how to write stories and guidelines, and the checks to run before finishing.
---

# Storybook maintenance

`app/storybook/` is the component library for the Dutch app in its **Сад** look: tokens, every UI component, and
concept screens. It is only useful while it matches the app. **A UI change is not done until Storybook shows it.**
This skill works together with `project-quality-standards`; where they differ, the exceptions are listed below.

## When this applies

| You are… | You must also… |
|---|---|
| Adding a UI component or a new variant/state of one | Add or extend its story and README in `stories/components/<Name>/` |
| Changing markup in `public/index.html` or a view in `public/app.js` | Update the matching story's markup so class names and structure match |
| Changing a style in `public/app.css` or `styles/garden.css` | Keep both consistent (see "Styles" below) and check the affected stories |
| Changing a colour, radius, spacing, size, shadow or font | Edit `tokens/tokens.json` only, then rebuild |
| Removing a component | Delete its story folder and README in the same commit |
| Building a screen that exists as a sketch | Turn its parts into component stories, then trim or delete the sketch |
| Only touching server code, the database or MCP tools | Nothing here, unless UI output changes |

## Layout

```
app/storybook/
  tokens/tokens.json        source of truth for every token (light-only Сад values + legacy "app today")
  scripts/build-tokens.js   generates styles/tokens.css (git-ignored, never edit by hand)
  styles/garden.css         component styles in the Сад look
  styles/stories.css        layout helpers for stories only (.r, .col, .wide) — never used by the app
  stories/Introduction.mdx  start page
  stories/foundations/      token pages, rendered from tokens.json
  stories/components/<Name>/<Name>.stories.js + README.md
  stories/sketches/<Name>/  concept screens: .html + .css + .stories.js + README.md, rendered in a shadow root
```

## Rules

### 1. Same commit
The app change and the Storybook change go in one commit. Never leave "update Storybook later" — the next session
will not know what drifted.

### 2. Tokens live in one place
- Every colour, radius, spacing, size, shadow and font family is a token in `tokens/tokens.json`.
- Styles and stories use `var(--token-name)`, never a raw hex, px radius or shadow. Exceptions: `0`, `1px`
  hairlines, `50%` for true circles, and layout sizes (widths, gaps that are not on the spacing scale).
- New Сад tokens are named `garden-<role>` and carry a `usage` sentence that says where they go and what may sit on
  them (contrast). Light and dark values are the same: Сад is light-only.
- Legacy tokens (usage starts with "App today:") are reference only. Don't use them in new work and don't mix them
  with `garden-*` on one screen.
- `styles/tokens.css` is generated; run `npm run tokens` (the `storybook` and `build` scripts do it first).

### 3. Styles
- `styles/garden.css` holds the Сад component styles. `public/app.css` is the app's current stylesheet. Until Сад
  ships, a style change for Сад goes in `garden.css`; a fix to the live app goes in `app.css` **and**, if the same
  rule exists in `garden.css`, there too.
- When Сад ships to the app, `garden.css` + `tokens.css` replace `app.css`, and this rule becomes "one stylesheet".
- Class names follow the BEM rules in `project-quality-standards` (`references/html-and-css.md`).
- Small elements stay modest: `garden-radius-sm` (8px) for controls and chips, 6px for tiny badges and chart bar
  tops. Only icon buttons, avatars and thin progress tracks are fully round.

### 4. One folder per component
`stories/components/<Name>/` contains exactly:
- `<Name>.stories.js` — the stories.
- `README.md` — the guidelines shown on the Docs page: one-line purpose, the variants as a list with the tokens
  they use, when to use and when not to, accessibility notes, and a last line saying where the markup comes from.
  No H1 (the Docs page already shows the title).

Folder and file names here are PascalCase (`WordTiles/WordTiles.stories.js`). This is the Storybook convention and an
accepted exception to the kebab-case rule in `project-quality-standards`.

### 5. How to write a story
Start from `references/story-template.md`. In short:
- `title: 'Components/<Group>/<Name>'`. Groups: Actions, Content, Data, Feedback, Forms, Navigation, Study. Add a
  group only when none fits.
- The default export sets `parameters.docs.description.component` from the README (`import readme from
  './README.md?raw'`).
- `Overview` shows every variant side by side with real markup.
- One named story per meaningful state, PascalCase (`Disabled`, `Wrong`, `Empty`, `LongText`), and a story with
  `args` + `argTypes` controls for components that have variants (see `Button`, `StatusPill`, `Message`,
  `WordTiles`).
- Markup is the app's markup: copy it from `public/index.html` or the HTML that `public/app.js` builds, with the same
  classes and attributes. Never invent classes in a story; story-only layout uses `styles/stories.css`.
- Cover the states the app really has: default, pressed/selected, disabled, error/wrong, empty, and long Ukrainian
  text (Ukrainian words are long; check wrapping).
- Stories are static: no fetch, no timers, no app modules with side effects.

### 6. Content
- UI text is Ukrainian and Dutch study material, exactly as the app writes it.
- The repository is public: no real names, emails, URLs of the server or personal word lists in stories or
  tokens. Use neutral samples ("Hoi, Олено!", `de fiets`, `werken`).

### 7. Accessibility
- Every button has `type`, every input a `label`, icon-only buttons an `aria-label`, toggles `aria-pressed`.
- Text colour pairs follow the contrast notes in each token's `usage`: `garden-ink` passes everywhere;
  `garden-ink-soft` not on gold or `garden-periwinkle`; coloured text (rust, wrong, slate, olive, roles) only on
  `garden-paper`, `garden-raised` or `garden-blush`. Meaning is never colour alone (right/wrong always has a word).
- A new colour pair needs a contrast check (WCAG 4.5:1 for text, 3:1 for large bold text and UI edges) written into
  the token's `usage`.

### 8. Sketches
Sketches are concepts, not components. They keep their own CSS in a shadow root (`shadow-frame.js`) so their class
names don't leak. When a sketched part gets built, it becomes a component story and the sketch is updated or
removed. Don't import sketch CSS anywhere else.

### 9. The claude.ai design system
The Сад design system also exists as a claude.ai Design System artifact. The repository is the master copy: change
tokens and styles here first, then mirror the change there if asked. Never copy values back from the artifact
without checking them against `tokens.json`.

## Commands

There is no Node on the VPS host; run everything in a container from `app/storybook/`:

```bash
docker run --rm -v "$PWD":/sb -w /sb node:24-bookworm-slim sh -c "npm install && npm run build"
```

```bash
docker run --rm -it -v "$PWD":/sb -w /sb -p 6006:6006 node:24-bookworm-slim sh -c "npm install && npm run storybook -- --host 0.0.0.0"
```

## Checklist before finishing

- [ ] Every UI component or state you added or changed has a story, and its README describes it.
- [ ] Story markup matches the app's markup (same classes, attributes, structure).
- [ ] No raw colours, radii or shadows: tokens only, and new tokens have a `usage` with contrast notes.
- [ ] Removed components have no story left; renamed ones are renamed in the story folder too.
- [ ] `npm run build` passes in Docker with no errors.
- [ ] You looked at the changed stories (dev server, or a Playwright screenshot of
      `iframe.html?id=<story-id>&viewMode=story` on the static build).
- [ ] Folder READMEs in `app/storybook/` list any added or removed files.
- [ ] No personal data in stories or tokens.
