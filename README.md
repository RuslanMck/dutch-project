# Dutch learning kit for Claude

A kit for learning Dutch with Claude, built for Ukrainian speakers at A1/A2 level: your own dictionary, grammar rules, flashcards, practice, and a mistake log that Claude keeps for you. Claude's explanations and the page interface are in Ukrainian.

## Quick start: set up with one prompt

1. In [claude.ai](https://claude.ai), create a **Project** (e.g. "Dutch") and open a new chat in it.
2. Copy the prompt below, paste it into the chat and send it. Claude fetches the files from this repo, creates your page, fills it and prepares the rest.
3. Approve Claude's write requests when asked (there will be several). At the end, do the two manual steps Claude points out: paste the project instructions and save the skill.

```text
Set up my Dutch learning kit from this public GitHub repo:
https://github.com/RuslanMck/dutch-project

Explain everything to me in Ukrainian. Do not change the repo.

1. Get the files: run `git clone --depth 1 https://github.com/RuslanMck/dutch-project` in your workspace. If cloning fails, ask me to download the ZIP (Code → Download ZIP) and attach it, then unpack it.
2. Publish `artifact/dutch-materials.html` as a new artifact with the `db` capability, exactly as it is (do not redesign it).
3. Import the starter data into that artifact's database with the ArtifactData tool:
   - `starter/rules.json` → collection `rules`
   - `starter/words.json` → collection `words`
   For every item use its `id` field as doc_id and write all other fields as the document (leave `id` out). Use `set` in batches of up to 50. Afterwards list both collections and tell me the counts (expected: 7 rules, 532 words).
4. In `project-instructions.md` and `skills/dutch-exercise-check/SKILL.md`, replace `<ARTIFACT_URL>` with my new artifact's link.
5. Give me the finished project instructions (the text below the line in `project-instructions.md`) in one copyable code block, and tell me to paste it into this Project's instructions field.
6. Give me the skill: if you can show a skill-proposal card, propose `dutch-exercise-check` with the updated SKILL.md; otherwise send me a ZIP of the `dutch-exercise-check` folder to upload as a skill.
7. Finish with one short line on how to start, e.g. "ask me for an exercise on rule 5.5".
```

If something goes wrong, use the manual setup below.

## What's inside

| File | What it is |
|---|---|
| `artifact/dutch-materials.html` | The "Dutch матеріали" page: dictionary, flashcards, practice, grammar rules with a mistake log |
| `starter/words.json` | Starter dictionary: ~530 Dutch words and phrases with Ukrainian translations, grouped by topic |
| `starter/rules.json` | 7 grammar rules explained in Ukrainian (articles, pronouns, modal verbs, plurals, adjectives…) |
| `project-instructions.md` | Instructions for the Claude Project: how to explain, give exercises and check answers |
| `skills/dutch-exercise-check/SKILL.md` | Skill: checks exercises with rule numbers and logs mistakes in the page |
| `app/` | Optional: the same page as a self-hosted web app (Docker, SQLite) with an MCP server, so Claude can update your data from any device. See `app/README.md` |

Rule numbers (1.4, 5.5…) match the sections of the textbook *Basic Dutch: A Grammar and Workbook* (Routledge). The textbook itself is not included.

## Manual setup (≈10 minutes)

You need a [claude.ai](https://claude.ai) account.

1. **Download the kit.** Green **Code → Download ZIP** button, then unzip it.
2. **Create a Project** in claude.ai (e.g. "Dutch").
3. **Create your page.** In a chat inside that Project, attach `artifact/dutch-materials.html`, `starter/words.json` and `starter/rules.json`, and send:

   > Publish dutch-materials.html as an artifact with the `db` capability. Then import into its database: rules.json → collection `rules`, words.json → collection `words` (doc_id = the `id` field; leave `id` out of the document). Write in batches of 50.

   Claude will ask you to approve the writes several times (about 12 batches). That's expected. You end up with your own page with its own link.
4. **Paste the instructions.** Open `project-instructions.md`, copy the text below the line into the Project's instructions field, and replace `<ARTIFACT_URL>` with your page's link.
5. **Add the skill (optional, recommended).** Replace `<ARTIFACT_URL>` in `skills/dutch-exercise-check/SKILL.md` too, zip the `dutch-exercise-check` folder and upload it to claude.ai as a skill (in the skills settings).

Done. Ask in the Project for an exercise on rule 5.5 to check that everything works.

## Making it your own

- **Words.** Add them on the "Таблиця" (Table) tab, or just tell Claude "add the word …". Remove words you don't need with the × button.
- **Rules.** Ask Claude to add a rule from a textbook section in its own words. Number your own rules Д1, Д2…
- **Explanation language.** Everything is set up for Ukrainian. For another language, change the project instructions, the skill and the translations in `words.json`.
- **Progress.** Word statuses (new / learning / learned) and the mistake log are yours alone: the page belongs to you and nobody else sees it unless you share the link.

## Updates

Your copy does not update itself. If new words or rules are added here, you can ask Claude to import only the new entries from `starter/`.

## Repository map

This repository holds two ways to use the kit: the claude.ai artifact kit (root files, `artifact/`, `starter/`, `skills/`) and the optional self-hosted app (`app/`). Personal data and secrets never go in git.

### Files

| File | What it does |
|---|---|
| `README.md` | This guide: what the kit is, how to set it up, and this map of the repository. |
| `project-instructions.md` | Text to paste into a Claude Project's instructions: how Claude explains, gives exercises and checks answers. |

### Folders

| Folder | Purpose |
|---|---|
| `app/` | Self-hosted web app (Node, Express, SQLite) with a REST API and an MCP server. |
| `artifact/` | The single-file "Dutch матеріали" page published as a claude.ai artifact. |
| `starter/` | Starter data (words and grammar rules) imported into a new artifact. |
| `skills/` | claude.ai skills that work with the artifact. |
| `.claude/skills/` | Claude Code skills for working on this repository (project quality standards). |
