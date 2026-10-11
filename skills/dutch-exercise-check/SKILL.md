---
name: dutch-exercise-check
description: Use when the learner submits answers to Dutch exercises or makes Dutch mistakes in a lesson - check, explain with rule numbers, and log mistakes in the "Dutch матеріали" artifact.
---

# Checking Dutch exercises

Always reply in Ukrainian, even if the learner writes in English (they may not have a Ukrainian keyboard). Keep it concise and structured.

## Artifact
"Dutch матеріали": <ARTIFACT_URL>  ← replace with the link to YOUR copy of the artifact
Read and write its database with the ArtifactData tool (load it via ToolSearch).

Collections:
- `rules`: {order, topic: "5.5 · прикметник" (rule number first), title, body}. Numbers like 5.5 are sections of the textbook "Basic Dutch: A Grammar and Workbook"; rules not from the textbook are numbered Д1, Д2… List the collection to get the current set.
- `mistakes`: {rule: <rules doc id or "other">, title, fix, count, last (ms timestamp), cases: [{w: wrong, r: right, d: "YYYY-MM-DD"}]}
- `words`: {nl, uk, art: "de"|"het"|"", ex, topic, status: new|learning|learned, err: number of times the learner got this word wrong, added (ms timestamp)}. The dictionary tab shows err in its own "Помилки" column, sortable, so err marks how critical the word is to learn.

## Feedback format
Per exercise give a score (e.g. 5/8). For every wrong answer:
1. The learner's version (✗)
2. The correct version (✓)
3. A short explanation for each problem that names the rule number from the artifact, e.g. "(правило 5.5)". Word-level problems say "(словник)". Use "(поза правилами)" when no rule covers it.

Correct answers: ✓.

Finish with a one-line summary of what to work on.

## The learner's reasoning
When the learner adds reasoning ("no -e because it is a het word"), review it for every item, whether the answer is right or wrong, as its own line after the item (e.g. "Твоє пояснення: …"):
- Correct and complete → say so in a few words.
- Right answer but incomplete or wrong reason → say what the real reason is, with the rule number. A right answer for the wrong reason will fail on the next example, so this matters as much as a wrong answer.
- Wrong reasoning behind a wrong answer → point to the exact step where the reasoning went off.
If the same flawed reasoning repeats across items, name the pattern once in the summary.

## Logging (do it every time, also for mistakes outside exercises)
1. Grammar mistakes → `mistakes`.
   - First query `mistakes` for that rule. If the same kind of mistake already exists, update it: count + 1, append a case, set last (pin with if_version).
   - Otherwise create one short entry: title (what went wrong), fix (one line), count, cases.
   - If no rule fits, use rule "other". Suggest adding a rule if a pattern keeps recurring.
2. Any word the learner got wrong (misspelled, wrong word chosen, wrong form of the word itself) → `words`.
   - Query by nl. If the word exists, err + 1 per occurrence and status "learning".
   - If it is not in the dictionary, add it with err 1 and status "learning", even if it was not marked DNK.
3. Words marked "DNK" (did not know) → add to `words` with status "new" if missing.

Use one batch call for all writes. Do not narrate the logging in detail; one line saying what was logged is enough.

## Practice format
Preferred exercise type: translating Ukrainian sentences into Dutch. Mix in short drills (plural forms, choose the adjective form). Do NOT give translations, Dutch words or article hints in exercises: the learner recalls words themselves and marks unknown ones as DNK. Do not give answers until the learner replies. Weight new exercises toward the rules with the most logged mistakes.
