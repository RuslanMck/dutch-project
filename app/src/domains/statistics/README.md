# statistics

The statistics report: how many words there are by status and kind, and how big every other collection is. Also the calendar of answers, the week recap and the daily goal (the goal is the one write here, to the practice settings). Read only, except `PUT /api/goal`.

## Files

| File | What it does |
|---|---|
| `statistics-repository.js` | Counting queries across the tables, the list of section codes, and every word's card and due time. |
| `statistics-service.js` | Builds the activity of `GET /api/stats/activity`, the calendar of `GET /api/stats/calendar`, the week recap of `GET /api/stats/week`, the daily goal of `GET /api/goal` and `PUT /api/goal`, and the report returned by `GET /api/stats` and the MCP `stats` tool, including the FSRS state counts and the words due today (in the practice time zone). The answers counted are the word, phrase and drill answers of the activity. |
| `learning-activity.js` | Pure: the learning activity of a period (answers, accuracy, time spent, days, words started and learned, the chart, the hardest words, the streak), `countAnswersByDay` (answers and good answers per calendar day) and `summarizeWeek` (the recap of the current or previous Monday to Sunday: totals, best day, hardest word, streak at its end). |
| `statistics-routes.js` | REST adapter: `GET /api/stats`, `GET /api/stats/activity?period=`, `GET /api/stats/calendar?days=` (7–371, default 84), `GET /api/stats/week?week=current\|previous` (default current), `GET /api/goal` and `PUT /api/goal` with body `{ goal }` (integer 5–500). Out-of-range values are 400. |
| `statistics-tools.js` | MCP adapter: the `stats` tool. |

## Calendar, week and goal

- `GET /api/stats/calendar?days=84` → `{ days: [{ date, answers, correct }] }`: one entry per calendar day in the practice time zone, oldest first, ending today; days without answers have 0. `correct` counts the answers graded good (drills: correct ones).
- `GET /api/stats/week?week=current|previous` → `{ range: { start, end }, answers, accuracy, days_practised, active_seconds, started_count, learned_count, best_day, hardest_word, streak }`. `current` runs from this Monday to today, `previous` from the Monday before to its Sunday. `accuracy` is a whole percent, null with no answers. `best_day` is the day with the most answers (a tie goes to the higher accuracy, then the earlier day), null when there are none. `hardest_word` is the first of the period's hardest words (`{ nl, article, uk, mistakes }`), null when none. `streak` is the streak at the end of the week shown (`current`, `longest`).
- `GET /api/goal` → `{ goal, today: { date, answers } }`. The goal is the `daily_goal` practice setting, default 20 (`DAILY_GOAL_DEFAULT`, not stored until it is changed). `PUT /api/goal` with `{ goal }` saves it (5–500) and returns the same shape.
