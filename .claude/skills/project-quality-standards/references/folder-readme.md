# A README in every folder

Every folder in the repository that contains files we write has a `README.md`. It is the map of that folder: a
reader learns what the folder is for and what each file does without opening them.

## Which folders

- **Required:** every folder with source, tests, migrations, scripts, data, docs or configuration, including the
  repository root, `app/`, `app/src/` and each subfolder, `app/public/` and its subfolders, `app/test/`,
  `app/migrations/`, `app/scripts/`, `app/docs/`, `artifact/`, `starter/`, `skills/`.
- **Not required:** `.git/`, `node_modules/`, `data/` (personal data, git-ignored), generated or cache folders.
  Inside a skill folder, `SKILL.md` plays this role, so a skill's `references/` folder is described in its
  `SKILL.md`, not in a separate README.

## Content

```markdown
# <folder name>

<One paragraph: what this folder is responsible for, and what does NOT belong here.>

## Files

| File | What it does |
|---|---|
| `word-repository.js` | SQL for `words` and `word_errors`; maps rows to `Word` objects. No business rules. |
| `word-service.js` | Word business rules: create with duplicate check, status changes, practice results. Publishes `words` change events. |

## Folders

| Folder | Purpose |
|---|---|
| `tests/` | … |

## Conventions

<Only what is specific to this folder, e.g. "every file here exports one create… factory"; link to the
project-quality-standards skill for general rules.>

## How to add a <thing>

<Short numbered steps, when the folder is an extension point (a new domain, a new migration, a new tab).>
```

Rules:
- One row per file, including non-code files (`.sql`, `.json`, `.html`, `.css`, `Dockerfile`, `.env.example`).
  Git-ignored files that the folder expects (`.env`) get a row saying they are not in git.
- "What it does" is one or two sentences about the file's **responsibility**, not its implementation.
- Leave out "Folders" and "How to add" when they would be empty.
- Write in English (UI text quoted in Ukrainian is fine).

## Keeping READMEs true

- Adding, renaming, moving or deleting a file updates its folder's README **in the same commit**.
- Changing what a file is responsible for updates its row.
- A review checks it: every file in the folder has a row, and every row names an existing file. This one-liner
  lists the files missing from a README:
  ```bash
  for f in *; do [ "$f" = README.md ] || grep -q "\`$f\`" README.md || echo "missing: $f"; done
  ```
