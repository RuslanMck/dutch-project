# achievements

The medals («Досягнення»): 116 of them in twelve groups, each counting one fact of the learner's practice, with the progress toward its target.

## Files

| File | What it does |
|---|---|
| `achievement-catalog.js` | Pure: the groups (`ACHIEVEMENT_GROUPS`) and the medals (`ACHIEVEMENT_CATALOG`): id, group, the metric it counts, its target, icon, and the Ukrainian title and description (plural forms via `ukrainian-plural.js`). Category medals (5, 10, 15, 25, 50 words of each category but `other`) name their category. |
| `achievement-facts.js` | Pure: the facts computed from the rows of one read (learned words and their categories, activity answers, counting deck answers, word-order and rule-exercise answers, the daily goal). Days, hours and weekdays are in the practice time zone. Uses `calculateStreak` and `findLearnedMoments` from the statistics. |
| `achievement-repository.js` | SQL for the facts sources, read once per request. The activity and deck answers come from the statistics repository, so both count the same answers. |
| `achievement-service.js` | `listAchievements()`: matches each medal with its metric; `unlocked` when the value reaches the target, `progress.current` stops at the target. |
| `achievement-routes.js` | REST adapter: `GET /api/achievements`. |
| `achievement-tools.js` | MCP adapter: `list_achievements` (read-only), the same list. |

## Rules

- A perfect set is a deck session with at least five counting answers, all of them `good`.
- A comeback is a return to practice after at least three days in a row without any answer.
- A weekend habit is a Saturday and the Sunday after it, both practised.
- The daily goal is the `daily_goal` setting (default 20); a day counts for the goal when its activity answers reach it.
