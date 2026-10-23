# Formatting

Formatting is mechanical. Follow it exactly so diffs show only real changes. The settings match Prettier 3 with the
config at the end of this file. When that config is added to the repository, Prettier output is the authority.

## All text files

- UTF-8, LF line endings, a final newline, no trailing whitespace.
- 2-space indentation (tabs only in `Caddyfile`, where Caddy's formatter uses them).
- At most 120 characters per line, except URLs and Ukrainian UI strings, which are not broken.

## JavaScript (Node and browser, ES modules)

- ES modules only (`import` / `export`), `"type": "module"`. No CommonJS, no default exports.
- Semicolons, single quotes (template literals only when interpolating or spanning lines), trailing commas in
  multi-line arrays, objects, parameters and calls.
- `const` by default, `let` only when reassigned, never `var`.
- Strict equality (`===`, `!==`). Optional chaining and `??` over `&&` chains and `||` for defaults.
- Named `function` declarations for module-level functions; arrow functions for callbacks and inline handlers. One
  arrow parameter has no parentheses (`word => …`); zero or several do (`() => …`, `(word, index) => …`).
- One statement per line. Braces on every `if` / `for` / `while` body, except a one-line guard `if (!word) return null;`.
- Early returns over nested `else`.
- Comments explain *why*, not *what*. A module starts with one comment line saying its responsibility. Exported
  functions with non-obvious parameters get a JSDoc block with `@param` and `@returns` types.
- Ordering inside a module: imports → constants → exported factory or functions → private helpers, with helpers
  below their first user.
- `async` / `await` over `.then()` chains; never leave a promise unhandled.

### Imports

```js
import crypto from 'node:crypto';
import path from 'node:path';

import express from 'express';
import { z } from 'zod';

import { createWordInputSchema, updateWordInputSchema } from '../../contracts/word-contracts.js';
import { NotFoundError } from '../../errors/domain-errors.js';
import { detectWordKind } from './expression-detection.js';
```

1. Three groups, in this order, separated by one blank line:
   1. Node built-ins, always with the `node:` prefix.
   2. Packages from `node_modules`.
   3. Project files: parent paths (`../…`) first, then same-folder paths (`./…`).
2. Alphabetical by path within each group; named imports inside the braces are alphabetical too.
3. Named imports only (`import { createWordService } from …`). Default imports only where a package offers nothing
   else (`express`, `better-sqlite3`), and Node built-ins as their module name (`import path from 'node:path'`).
   No namespace imports (`import * as repo`), because they hide which functions a module depends on.
4. Project paths are relative and include the `.js` extension. At most two `../` levels. Deeper means the module
   is in the wrong folder, or should receive the dependency through its factory instead.
5. No side-effect imports (`import './setup.js'`), except in the composition root.
6. Browser modules import only browser modules (`public/scripts/…`), never `src/`.
7. When an import line passes 120 characters, put one name per line with a trailing comma.

## SQL (SQLite migrations and queries)

- Keywords UPPERCASE, identifiers lowercase snake_case.
- One column per line in `CREATE TABLE`, aligned types. Comments with `--` after the column explain meaning and units.
- Multi-line queries in JavaScript use template literals with clauses on their own lines:
  ```js
  const selectWordsByStatement = database.prepare(`
    SELECT words.id, words.dutch_text, words.ukrainian_text
    FROM words
    WHERE words.learning_status = @learningStatus
    ORDER BY words.added_at ASC, words.id ASC
  `);
  ```
- Always qualify columns with the table name when a query joins tables.
- Parameters are named (`@learningStatus`) when a statement has more than one.

## HTML

- 2-space indentation, double-quoted attributes, lowercase tags and attributes, no closing slash on void elements
  (`<input>`, `<meta>`).
- Attribute order: `id`, `class`, `name`, `type`, `data-*`, `aria-*` and `role`, other attributes, event-free
  (no inline `onclick`; handlers are bound in scripts).
- One element per line when it has children; short inline elements may stay on one line.

## CSS

- One selector per line in a list, one declaration per line, a space after `:`, and a semicolon on every
  declaration.
- Order inside a rule: layout (`display`, `position`, `grid…`, `flex…`), box (`width`, `margin`, `padding`, `border`),
  typography, colour, other.
- Colours only through custom properties declared on `:root` (see `html-and-css.md`).
- Minified CSS is not allowed in source, including inside `artifact/dutch-materials.html`.

## JSON

- 2-space indentation, double quotes, no trailing commas, a final newline.
- Data files (`starter/*.json`) keep the key order of their contract.

## Markdown

- ATX headings (`#`), one `#` per file, a blank line around headings, lists and code blocks.
- Fenced code blocks with a language tag (`js`, `sql`, `bash`, `yaml`, `text`).
- Tables for file inventories (`folder-readme.md`).
- Lines may be long (prose wraps on screen); do not hard-wrap mid-sentence in new files.

## YAML (Compose) and Dockerfile

- YAML: 2-space indentation, lists as `- item`, quoted port mappings (`"443:443"`), keys in Compose's documented
  order: `name`, `services`, `networks`, `volumes`. Inside a service: `image`/`build`, `container_name`, `command`,
  `restart`, `depends_on`, `env_file`, `environment`, `ports`, `expose`, `volumes`, `networks`, `healthcheck`.
- Dockerfile: instructions UPPERCASE, one concern per `RUN`, a pinned base image tag (`node:24-bookworm-slim`), copy
  `package*.json` and install before copying source so layers cache well, a non-root `USER`.

## Recommended tooling config

`.prettierrc.json` (when added, at `app/`):
```json
{
  "printWidth": 120,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```
`.editorconfig` (repository root):
```text
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[Caddyfile]
indent_style = tab
```
