# HTML and CSS

Applies to `app/public/` and to `artifact/dutch-materials.html`.

## Document skeleton

```html
<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dutch матеріали</title>
  <link rel="stylesheet" href="styles/application.css">
</head>
<body>
  <header class="page-header">…</header>
  <nav class="tab-navigation" aria-label="Розділи">…</nav>
  <main id="main-content">
    <section id="word-table-tab" class="tab-panel" aria-labelledby="word-table-tab-heading">…</section>
  </main>
  <script type="module" src="scripts/application.js"></script>
</body>
</html>
```

## Tags: pick the element for its meaning

| Content | Element |
|---|---|
| Site header with title and logout | `<header>` containing the single `<h1>` |
| Tab bar | `<nav>` with `role="tablist"` and buttons with `role="tab"` |
| Each tab's content | `<section role="tabpanel">` with a heading (`<h2>`, visually hidden if needed) |
| A self-contained item (phrase, text, flashcard, mistake pattern) | `<article>` |
| Accordion (rules) | `<details>` / `<summary>` |
| Word list | `<table>` with `<caption>` (may be visually hidden), `<thead>`, `<th scope="col">`, `<tbody>` |
| Lists of items without columns | `<ul>` / `<ol>` with `<li>` |
| Struck-out wrong answer / correct answer | `<del>` / `<ins>` (not `<s>` or styled `<span>`) |
| Bold rule keywords from the mini-markdown | `<strong>` (the renderer's `<b>` is legacy; see current-state.md) |
| Example sentences | `<blockquote>` with class |
| Dates and times | `<time datetime="2026-10-23">` |
| Forms | `<form>` with every control inside a `<label>`, or a `<label for>` pairing |
| Actions | `<button type="button">` or `type="submit"`; links (`<a>`) only for navigation |
| Status messages | an element with `role="status"` (polite) or `role="alert"` (errors) |

Rules:
- One `<h1>` per page. Heading levels never skip (`h1` → `h2` → `h3`).
- No `<div>` or `<span>` where a semantic element fits. `<div>` is for layout wrappers only.
- Every `<img>` and `<svg>` that carries meaning has text: `alt`, or `<title>` plus `aria-labelledby`.
- Every interactive element is reachable by keyboard and has a visible focus style.
- No inline styles (`style="…"`) and no inline event handlers (`onclick="…"`).
- UI text is Ukrainian and exactly as specified in `app/docs/HANDOFF.md`.

## ids, classes and data attributes

Three separate jobs, three separate kinds of names:

| Purpose | Mechanism | Naming | Example |
|---|---|---|---|
| JavaScript finds a unique element | `id` | kebab-case `<area>-<element>[-<role>]`, whole words | `word-table-search-input`, `practice-answer-form`, `flashcard-know-button` |
| JavaScript finds repeated elements, or carries data | `data-*` | kebab-case; value is an id or a keyword | `data-tab-name="practice"`, `data-word-id="42"`, `data-action="delete-word"` |
| Styling | `class` | BEM: `block`, `block__element`, `block--modifier`, kebab-case words | `flashcard`, `flashcard__translation`, `status-button--learning` |

- JavaScript never selects by class, and CSS never selects by id or `data-` attribute. The exception is state
  attributes that both legitimately use: `[aria-selected="true"]`, `[hidden]`, `[open]`.
- ids are unique per page and prefixed with their area, so two tabs never collide.
- Form control `name`s are camelCase and match the contract field they fill (`name="dutchText"`). Then
  `Object.fromEntries(new FormData(form))` produces a valid contract input.
- No abbreviations in any of them (`table-q` → `word-table-search-input`, `.del` → `.delete-button`, `.mh` →
  `.mistakes-heading`).

## CSS

- One stylesheet per page area under `public/styles/` (or one `application.css` while it stays under ≈ 600 lines),
  ordered: custom properties → base elements → layout → components (one BEM block per section, in page order) →
  utilities (`.visually-hidden`).
- **Custom properties** are named `--<category>-<name>` with whole words, declared on `:root`:
  `--color-background`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`,
  `--color-accent`, `--color-on-accent`, `--color-danger`, `--color-success`, `--space-small`, `--space-medium`,
  `--radius-medium`, `--font-size-small`. Not `--bg`, `--fg`, `--mut`, `--acc`.
- Dark mode: redefine the colour properties under `@media (prefers-color-scheme: dark)` guarded by
  `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. Components never contain colour
  values, only `var(--color-…)`.
- Accent is `#c2410c` (light) and `#fb923c` (dark).
- Mobile first: works at 320 px wide with a 16 px side gutter and no horizontal page scroll. Wide content (tables)
  scrolls inside its own wrapper with `overflow-x: auto`, and that wrapper is a positioning context.
- Selectors stay flat: at most one level of descendant for BEM blocks (`.rule-card__body table`), no `!important`.
- Utility classes are explicit: `.visually-hidden`, not `.sr-only`.
