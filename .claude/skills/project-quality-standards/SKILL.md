---
name: project-quality-standards
description: Use when writing, reviewing, refactoring, renaming or adding any file in the dutch-project repository (JavaScript on Node and in the browser, SQLite SQL, HTML, CSS, JSON data, Markdown, Dockerfile and Compose YAML). Defines the architecture (isolated responsibilities, factories, inversion of control), Zod contracts, naming for files, folders, variables, functions, database elements and HTML/CSS, formatting and import order, and the rule that every folder has a README.
---

# dutch-project quality standards

These rules apply to every change in this repository. When a rule conflicts with existing code, the rule wins for
new and touched code. `references/current-state.md` lists the known deviations and how to migrate them.

## How to use this skill

1. Before writing code, read the reference for what you are touching:

   | Touching | Read |
   |---|---|
   | Any JavaScript module, its folder or its dependencies | `references/architecture.md` |
   | Input/output shapes, REST bodies, MCP tool arguments, env, data files | `references/contracts.md` |
   | Any name: file, folder, variable, function, table, column, CSS class, HTML id | `references/naming.md` |
   | Layout, quotes, imports, SQL/HTML/CSS/JSON/Markdown/YAML style | `references/formatting.md` |
   | `public/` pages, markup, styles | `references/html-and-css.md` |
   | UI components, tokens, anything in `app/storybook/` | the `storybook-maintenance` skill |
   | Migrations, tables, views, indexes, queries | `references/database.md` |
   | Adding, moving or deleting any file | `references/folder-readme.md` |
   | Planning a refactor of existing code | `references/current-state.md` |

2. Write the change.
3. Run the checklist below before calling the work done.

## Core rules (summary; the references are authoritative)

**Architecture.** One responsibility per module. Modules are grouped by domain (words, rules, mistakes, phrases,
texts) and, inside a domain, split by layer: *repository* (SQL only) → *service* (business rules) → *adapters*
(REST routes, MCP tools, browser views). Dependencies are passed in through `create…` factory functions; no module
reaches for a global database, `process.env` or a singleton. Only the composition root (`src/server/`) reads
configuration, opens the database, starts timers and listens on a port. Pure logic (answer checking, rule
rendering, expression detection) lives in modules with no I/O.

**Contracts.** Every shape that crosses a boundary has exactly one Zod schema in `src/contracts/`: HTTP body, query
and params, MCP tool arguments, environment, import files and starter data. Boundaries parse; the code inside trusts
the parsed value. Derive variants with `.pick()`, `.partial()` and `.extend()`; never copy a schema. Types come from
the schemas through JSDoc `@typedef {z.infer<typeof …>}`.

**Naming.** Explicit, whole words. No abbreviations: `database` not `db`, `error` not `err`, `request` not `req`,
`index` not `i`, `dutchText` not `nl`. The only allowed short forms are the acronyms in
`references/naming.md` (id, url, html, css, json, sql, api, http, https, mcp, sse, utc, uuid). Files and folders
are kebab-case (`word-repository.js`), variables and functions camelCase, constants UPPER_SNAKE_CASE, database
elements snake_case, CSS classes BEM in kebab-case, HTML ids kebab-case and scoped
(`word-table-search-input`). Functions start with a verb from the vocabulary in `naming.md`.

**Formatting.** 2-space indent, semicolons, single quotes, trailing commas in multi-line literals, 120-column limit.
Imports go in three groups separated by a blank line: `node:` built-ins, packages, project files. Each group is
alphabetical by path, uses named imports only, and project paths keep the `.js` extension.

**HTML.** Semantic landmarks (`header`, `nav`, `main`, `section`, `footer`), one `h1`, every input has a `label`,
every `button` has a `type`. JavaScript selects elements through ids or `data-` attributes, never through styling
classes. UI text stays Ukrainian, and `lang="uk"`.

**Database.** Tables are plural snake_case nouns, columns are singular and whole words, foreign keys are
`<singular_table>_id`, times are `<event>_at` (INTEGER milliseconds), calendar dates are `<event>_on` (TEXT
YYYY-MM-DD), indexes are `index_<table>_on_<columns>`, views are `view_<purpose>`. Change the schema only through a new
numbered migration; never edit or rename one that has been applied.

**Folder READMEs.** Every folder we own has a `README.md` that states the folder's purpose and has a table with one
row per file describing what that file does. Adding, renaming or deleting a file updates that README in the same
commit.

## Checklist before finishing

- [ ] Each new or changed module has one responsibility and receives its dependencies through a factory.
- [ ] No module outside `src/server/` reads `process.env`, opens the database or starts timers.
- [ ] Every boundary input is parsed with a schema from `src/contracts/`, and no schema is duplicated.
- [ ] Errors are domain errors (`NotFoundError`, `ValidationError`, `ConflictError`). Only adapters map them to HTTP status codes or MCP `isError`.
- [ ] Every new name is explicit and abbreviation-free, and follows the casing for its kind.
- [ ] Imports are grouped, alphabetical and named, with `.js` extensions.
- [ ] HTML uses semantic tags, labels and typed buttons, with scoped ids and BEM classes.
- [ ] Schema changes are a new migration that follows the database naming.
- [ ] Every folder touched has an up-to-date `README.md`.
- [ ] UI changes are reflected in Storybook in the same commit (`storybook-maintenance` skill), and its build passes.
- [ ] Tests cover the change (`node --test`), and `npm test` passes in Docker.
- [ ] If a contract that Claude uses changed (MCP tool names or arguments, REST fields), the skills and docs that mention it are updated.
