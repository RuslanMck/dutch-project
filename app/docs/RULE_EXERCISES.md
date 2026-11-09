# Вправи з правил (draft)

A page that asks short questions on the grammar rules: fill the gap (type the word) or pick one option (2–4; for word
order, whole sentences). The questions are made by the LLM on OpenRouter, so they keep changing.

- **Setup:** choose rules (kept on the phone), each with its numbers («12 відповідей · правильно 75%»); «Почати: 10 питань».
- **A set:** exercises never answered first, spread over the chosen rules, plus up to 2 whose last answer was wrong
  (at least 30 minutes ago). When fewer than needed are in stock, the server generates 10–15 first (the page waits,
  «Готую нові питання…»); after each set it refills the stock in the background so the next set starts at once.
- **Variety:** each request gets the rule texts, the learner's words (learning/learned, plus a sample of others),
  3 random everyday situations and the last 150 saved sentences of these rules to avoid. A sentence with the same
  answer is never saved twice (`sentence_key`).
- **Answer:** checked on the server (case, spaces, final punctuation, typographic quotes ignored; `accepted_answers`
  also right); the page shows ✓/✗, the right answer in the gap, the translation and a Ukrainian explanation with the
  rule code. «Не знаю» counts as wrong. The end lists the mistakes.

Server: `src/domains/rule-exercises/` (prompt, repository, service, routes), migration `016-add-rule-exercises.sql`,
`GET /api/rule-exercises/rules`, `POST /api/rule-exercises/sets { rule_ids?, count }`,
`POST /api/rule-exercises/:id/answers { answer, skipped }`. Needs `OPENROUTER_API_KEY`. The model is
`RULE_EXERCISE_MODEL` (default `google/gemini-3.7-flash`, about $0.02 per batch of 12); word order keeps
`OPENROUTER_MODEL`. Chosen in a comparison on 2026-11-09 (5 models, then Gemini against Claude Haiku 5.5 in 3 batches and
8 tutor dialogues): the fewest Dutch mistakes, kept the right answer when the learner pushed back, the cleanest Ukrainian.
The parser turns LaTeX arrows (`$\rightarrow$`) into → and drops markdown `**`.

Not in the draft yet: statistics page, MCP tools, offline use, editing or deleting a bad question.
