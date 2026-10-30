# migrations

Numbered SQL files that build the SQLite schema. The runner applies them in name order and records each file name in `schema_migrations`. Pragmas are set by the connection code, not here.

## Files

| File | What it does |
|---|---|
| `001_init.sql` | Core schema from the handoff spec: sections, topics, rules, texts, words, word errors, phrases, mistake patterns and cases, plus the views with error counts. |
| `002_practice_attempts.sql` | Adds `practice_attempts`, one row per practice answer, right or wrong. |
| `003-add-fsrs-practice.sql` | Adds the FSRS card, due date, introduction date, frequency rank and priority columns to `words`, plus `review_logs`, `practice_settings` (seeded defaults) and `word_frequencies`. |
| `004-add-phrase-fsrs-practice.sql` | Adds the FSRS card, due date, introduction date and status to `phrases`, plus `phrase_review_logs` and the `phrase_new_per_day` setting (5). |
| `005-allow-regrade-after-reset.sql` | Adds `superseded_at` to `review_logs` and `phrase_review_logs` (NULL = the log counts for its session; a practice reset sets it) and replaces the unique indexes on (session, item) with partial ones over the logs that still count (`WHERE superseded_at IS NULL`), so an item graded before a practice reset can be graded once more in the same session, and a third grade is still refused. |
| `006-add-learning-deck.sql` | The learning deck: `words.deck_required_correct` (NULL = not in the deck) and `deck_correct_streak`, and `deck_answers`, one row per answer (repeats in a session too) with the position after it. Run `scripts/rebuild-learning-deck.js --apply` once after it. |
| `007-count-deck-answers-and-entry.sql` | The deck counts right answers in total: renames `deck_correct_streak` to `deck_correct_count` (and `correct_streak_after` to `correct_count_after`), and adds `words.deck_entered_by_lapse` (only words that entered as New hold back the next session's new words). Run `scripts/rebuild-learning-deck.js --apply` after it. |
| `008-add-two-way-practice.sql` | Two-way practice: `words.deck_reverse_*` columns for the nl_uk direction (the existing deck columns are uk_nl), `direction` on `deck_answers`, `direction` and `second_grade` on `review_logs` and `phrase_review_logs`, and `phrase_answers`, one counting answer per phrase, session and direction (existing phrase grades become uk_nl answers). |
| `009-add-word-order-sentences.sql` | The word-order exercise: `order_sentences` (the Dutch and Ukrainian sentence, its optional rule, its source and a normalized key that makes repeats unique) and `order_sentence_answers`, one row per answer. |
| `010-add-sentence-structure.sql` | `order_sentences.structure`: the sentence's schema as a JSON array of `{ text, role }` segments (NULL = no schema yet). |
| `011-add-alternative-word-orders.sql` | `order_sentences.alt_orders`: the other natural word orders of a sentence as a JSON array of strings (`'[]'` = only the canonical order). |
| `012-add-custom-decks.sql` | Custom decks: `custom_decks` (unique name ignoring case) and `custom_deck_words`, the words of each deck in the order added (cascade on delete of a deck or a word). |
| `013-add-wrong-forms.sql` | `order_sentences.wrong_forms`: wrong forms of the sentence's words (single words, JSON array of strings) used as its extra tiles (`'[]'` = random extra words). |
| `014-add-drill-answers.sql` | `drill_answers`: one row per checked answer of a custom drill (round-summary drills, decks, Важкі слова), for the statistics only; the schedule never reads it. |

## Conventions

- Never edit, rename or delete a migration that has been applied: the runner tracks them by file name. The two legacy names above stay as they are.
- New files are named `NNN-<verb>-<object>.sql` (for example `003-rename-word-text-columns.sql`), one concern each. See `references/database.md` in the project-quality-standards skill.

## How to add a migration

1. Create the next number: `NNN-<verb>-<object>.sql`.
2. Write the change; recreate any view that uses a renamed column in the same file.
3. Run the test suite, then test it on a copy of the real database before deploying.
4. Add a row to this README.
