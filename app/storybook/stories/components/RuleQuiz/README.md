The grammar quiz («Вправи з правил»): the learner picks the rules, the app makes a set of ten new sentences with the learner's words, and each question asks for the missing word or the right sentence. The screens are setup, loading, question, feedback and the summary of the set.

- `.word-order__rules` — the «Правила: 2 з 3» picker (the same picker as Порядок слів), each rule a checkbox with its answers so far (`.rule-quiz__rule-stats`).
- `.rule-quiz__note` and `.rule-quiz__start` — the explanation and the primary «Почати: 10 питань».
- `.rule-quiz__card` — one question: the progress («Питання 3 з 10»), the rule, the question, the sentence with the gap (`.rule-quiz__gap`, `--right` in green, `--wrong` in `garden-wrong`).
- `.rule-quiz__options--sentences` and `.rule-quiz__option` — the choice of sentences; `--right` and `--wrong` after an answer.
- `.rule-quiz__explanation` and `.rule-quiz__translation` — why the answer is right, in Ukrainian.
- `.rule-quiz__summary` — the end of a set: «Правильно 7 з 10», the mistakes (`.rule-quiz__mistakes`) with the rule and the explanation, and the next step.

Use it for practising grammar in sentences. Don't use it for word order (Порядок слів) or for the article (ArticleBoard).

Accessibility: every right and wrong answer has words («✓ Правильно», «✗ Правильно: de»); the colour only repeats them. The sentence has `lang="nl"`, so a screen reader reads Dutch with Dutch pronunciation. The message line is `aria-live="polite"`; the error uses `role="alert"`.

Note: the question texts here are samples. The rule codes and titles come from the server; the stories use the same classes and layout.

Markup from `public/index.html` (`#tab-rule-quiz`) and `public/app.js` (`renderRuleQuiz`, `renderRuleQuizSentence`, `renderRuleQuizOptions`, `renderRuleQuizSummary`); styled by `storybook/styles/garden.css`.
