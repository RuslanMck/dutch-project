// Tests for the pure UI helpers in public/logic.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc,
  normalise,
  normalizeAnswerText,
  levenshtein,
  checkAnswer,
  gradeTranslationAnswer,
  renderRuleBody,
  formatDutchWithArticle,
  revealTranslationAnswer,
  pluralizeDays,
  formatDaysAway,
  formatLearningStatus,
  buildNextReviewLine,
  formatShortDate,
  advanceDrillQueue,
  advanceWindowedQueue,
  formatQueueProgress,
  formatDuration,
  pluralize,
  buildRoundSummaryView,
  buildActivityTiles,
  buildChartView,
  buildStreakTiles,
  formatActivityRange,
  shuffle,
  formatStrugglingDrillButton,
  buildCustomDrillEnd,
  buildRoundDrillButtons,
  formatCustomDrillProgress,
  planCustomDrill,
  CUSTOM_DRILL_NOTE,
  gradeReverseTranslationAnswer,
  revealReverseTranslationAnswer,
  orderNextRound,
  formatRoundProgress,
  formatRoundStart,
  answerKey,
  splitIntoRounds,
  planNextRound,
  ROUND_DIRECTIONS,
  createWordOrderState,
  placeTile,
  returnTile,
  readAnswerTiles,
  formatWordOrderProgress,
  formatWordOrderSummary,
  buildWordOrderCheckView,
  buildAlsoOrderLines,
  formatOrderCountLabel,
  formatSentenceStats,
  formatImportResult,
  shouldApplyFetch,
  chooseFocusAfterPlace,
  chooseFocusAfterReturn,
  chooseFirstPileFocus,
  skipSentenceInSet,
  WORD_ORDER_RULES,
  RULE_LABELS,
  ruleLabel,
  formatRuleFilterSummary,
  buildRulesQuery,
  parseStoredRules,
  formatStructureLine,
  roleColourClass,
  clearSelected,
  filterCatalog,
  foldSearchText,
  formatDeckWordCount,
  formatDeckWordLabel,
  formatDifficultyLabel,
  formatLastPracticed,
  formatSelectedCount,
  selectVisible,
  sortCatalog,
  toggleSelected,
  TAB_TITLES,
} from '../public/logic.js';

test('esc escapes HTML special characters', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
});

test('renderRuleBody: table with header row, separator dropped, bold cells', () => {
  const html = renderRuleBody('| Слово | Переклад |\n|---|---|\n| huis | **будинок** |');
  assert.match(html, /<table>/);
  assert.match(html, /<th>Слово<\/th>/);
  assert.match(html, /<th>Переклад<\/th>/);
  assert.match(html, /<td>huis<\/td>/);
  assert.match(html, /<td><b>будинок<\/b><\/td>/);
  assert.doesNotMatch(html, /---/);
});

test('renderRuleBody: only the outer pipes are dropped, an empty inner column stays', () => {
  const html = renderRuleBody('| | de-слово | het-слово |\n|---|---|---|\n| | **de** cursus | **het** café |');
  assert.match(html, /<th><\/th><th>de-слово<\/th><th>het-слово<\/th>/);
  assert.equal((html.match(/<th>/g) || []).length, 3);
  assert.match(html, /<td><b>de<\/b> cursus<\/td>/);
});

test('renderRuleBody: list block', () => {
  assert.equal(renderRuleBody('- a\n- **b**'), '<ul><li>a</li><li><b>b</b></li></ul>');
});

test('renderRuleBody: example box strips > and one optional space', () => {
  const html = renderRuleBody('> een groot gezin\n>Prettig weekend!');
  assert.equal(html, '<div class="ex">een groot gezin<br>Prettig weekend!</div>');
});

test('renderRuleBody: paragraph lines joined with <br>, blank line starts a new block', () => {
  assert.equal(renderRuleBody('line1\nline2\n\nline3'), '<p>line1<br>line2</p><p>line3</p>');
});

test('renderRuleBody: bold inside paragraph and escaping of user HTML', () => {
  const html = renderRuleBody('Закінчення **-en**\n<script>alert(1)</script>');
  assert.match(html, /<b>-en<\/b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('renderRuleBody: escaping happens before bold, so raw tags inside ** stay inert', () => {
  assert.equal(renderRuleBody('**<i>x</i>**'), '<p><b>&lt;i&gt;x&lt;/i&gt;</b></p>');
});

test('normalise lowercases, trims, collapses whitespace', () => {
  assert.equal(normalise('  Het   HUIS  '), 'het huis');
});

test('levenshtein distances', () => {
  assert.equal(levenshtein('huis', 'huis'), 0);
  assert.equal(levenshtein('huis', 'huiz'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

const huis = { nl: 'huis', uk: 'будинок', article: 'het' };

test('checkAnswer all mode: "het huis" is correct', () => {
  const r = checkAnswer(huis, 'het huis', 'all');
  assert.equal(r.counted, true);
  assert.equal(r.correct, true);
});

test('checkAnswer all mode: "huis" without article is correct', () => {
  const r = checkAnswer(huis, 'huis', 'all');
  assert.equal(r.counted, true);
  assert.equal(r.correct, true);
});

test('checkAnswer all mode: "de huis" gives article message and counts as wrong', () => {
  const r = checkAnswer(huis, 'de huis', 'all');
  assert.equal(r.counted, true);
  assert.equal(r.correct, false);
  assert.match(r.message, /^Слово вірно, але артикль: ✗ → ✓/);
});

test('checkAnswer all mode: one letter off gives "Майже" and counts as wrong', () => {
  const r = checkAnswer(huis, 'huiz', 'all');
  assert.equal(r.counted, true);
  assert.equal(r.correct, false);
  assert.match(r.message, /^Майже, перевір літери\. Правильно: het huis/);
});

test('checkAnswer all mode: totally wrong shows the right answer with article', () => {
  const r = checkAnswer(huis, 'kat', 'all');
  assert.equal(r.counted, true);
  assert.equal(r.correct, false);
  assert.equal(r.message, '✗ Правильно: het huis');
});

test('checkAnswer all mode: normalises case and whitespace before comparing', () => {
  assert.equal(checkAnswer(huis, '  HET   Huis ', 'all').correct, true);
});

test('checkAnswer art mode: "xx" is not counted', () => {
  const r = checkAnswer(huis, 'xx', 'art');
  assert.equal(r.counted, false);
  assert.equal(r.correct, false);
  assert.equal(r.message, 'Напиши лише de або het');
});

test('checkAnswer art mode: right and wrong article', () => {
  assert.equal(checkAnswer(huis, 'het', 'art').correct, true);
  const wrong = checkAnswer(huis, 'de', 'art');
  assert.equal(wrong.counted, true);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.message, '✗ Правильно: het huis');
});

const appel = { nl: 'appel', uk: 'яблуко', article: '' };

test('gradeTranslationAnswer: empty input is not counted', () => {
  const r = gradeTranslationAnswer(huis, '   ');
  assert.equal(r.counted, false);
  assert.equal(r.grade, null);
});

test('gradeTranslationAnswer: full answer with the right article is good', () => {
  assert.deepEqual(gradeTranslationAnswer(huis, 'het huis'), { counted: true, grade: 'good', message: '✓ Правильно' });
  assert.equal(gradeTranslationAnswer(huis, '  HET   Huis ').grade, 'good');
});

test('gradeTranslationAnswer: word without article is good with the bare word', () => {
  assert.equal(gradeTranslationAnswer(appel, 'appel').grade, 'good');
});

test('gradeTranslationAnswer: wrong article on a de/het word is good with the right article named', () => {
  const r = gradeTranslationAnswer(huis, 'de huis');
  assert.equal(r.counted, true);
  assert.equal(r.grade, 'good');
  assert.equal(r.message, '✓ Правильно (артикль: het)');
});

test('gradeTranslationAnswer: missing article on a de/het word is good with the right article named', () => {
  const r = gradeTranslationAnswer(huis, 'huis');
  assert.equal(r.counted, true);
  assert.equal(r.grade, 'good');
  assert.equal(r.message, '✓ Правильно (артикль: het)');
  assert.equal(gradeTranslationAnswer({ nl: 'kat', uk: 'кіт', article: 'de' }, 'kat').message, '✓ Правильно (артикль: de)');
});

test('gradeTranslationAnswer: right article on a de/het word is good with the plain message', () => {
  const r = gradeTranslationAnswer(huis, 'het huis');
  assert.deepEqual(r, { counted: true, grade: 'good', message: '✓ Правильно' });
});

test('gradeTranslationAnswer: article typed on a word without article is good with the plain message', () => {
  const r = gradeTranslationAnswer(appel, 'de appel');
  assert.deepEqual(r, { counted: true, grade: 'good', message: '✓ Правильно' });
});

test('gradeTranslationAnswer: a wrong article with a spelling slip is hard, not good', () => {
  const r = gradeTranslationAnswer(huis, 'de huiz');
  assert.equal(r.grade, 'hard');
  assert.equal(r.message, 'Майже, перевір літери. Правильно: het huis');
});

test('gradeTranslationAnswer: an expression that starts with het is compared in full', () => {
  const expression = { nl: 'het is goed', uk: 'це добре', article: '' };
  assert.deepEqual(gradeTranslationAnswer(expression, 'het is goed'), { counted: true, grade: 'good', message: '✓ Правильно' });
  assert.equal(gradeTranslationAnswer(expression, 'het is goet').grade, 'hard');
  assert.equal(gradeTranslationAnswer(expression, 'is goed').grade, 'again');
});

test('gradeTranslationAnswer: one letter off is hard, with or without article', () => {
  const bare = gradeTranslationAnswer(huis, 'huiz');
  assert.equal(bare.grade, 'hard');
  assert.equal(bare.message, 'Майже, перевір літери. Правильно: het huis');
  const withArticle = gradeTranslationAnswer(huis, 'het huiz');
  assert.equal(withArticle.grade, 'hard');
  assert.equal(withArticle.message, 'Майже, перевір літери. Правильно: het huis');
  assert.equal(gradeTranslationAnswer(huis, 'de huiz').grade, 'hard');
  assert.equal(gradeTranslationAnswer(appel, 'appl').grade, 'hard');
});

test('gradeTranslationAnswer: a wrong word is again and shows the right answer', () => {
  const r = gradeTranslationAnswer(huis, 'kat');
  assert.equal(r.counted, true);
  assert.equal(r.grade, 'again');
  assert.equal(r.message, '✗ Правильно: het huis');
});

test('gradeTranslationAnswer: DNK in any case is again', () => {
  assert.equal(gradeTranslationAnswer(huis, 'dnk').grade, 'again');
  assert.equal(gradeTranslationAnswer(huis, 'DNK').message, '✗ Правильно: het huis');
  // "dnk" is one letter off "dan"; DNK must still be again.
  assert.equal(gradeTranslationAnswer({ nl: 'dan', uk: 'тоді', article: '' }, 'DNK').grade, 'again');
});

test('gradeTranslationAnswer: a bare article on its own is again', () => {
  assert.equal(gradeTranslationAnswer(huis, 'het').grade, 'again');
});

test('checkAnswer keeps its own rules (article drill still uses it)', () => {
  assert.equal(checkAnswer(huis, 'de huis', 'all').correct, false);
  assert.equal(checkAnswer(huis, 'het', 'art').correct, true);
});

test('normalizeAnswerText drops punctuation, maps typographic quotes, collapses spaces', () => {
  assert.equal(normalizeAnswerText('Hoe gaat het?'), 'hoe gaat het');
  assert.equal(normalizeAnswerText(' goed,  dank je wel. En met jou… '), 'goed dank je wel en met jou');
  assert.equal(normalizeAnswerText('(het) "café"!'), 'het café');
  assert.equal(normalizeAnswerText('’s ochtends'), "'s ochtends");
  assert.equal(normalizeAnswerText("‘s ochtends"), "'s ochtends");
  assert.equal(normalizeAnswerText("'s ochtends"), "'s ochtends");
  assert.equal(normalizeAnswerText('ім’я'), "ім'я");
  assert.equal(normalizeAnswerText('імʼя'), "ім'я");
  assert.equal(normalizeAnswerText('ім`я'), "ім'я");
});

test('gradeTranslationAnswer: question mark on the expected word is ignored, so the answer is good', () => {
  const question = { nl: 'hoe gaat het?', uk: 'як справи', article: '' };
  assert.equal(gradeTranslationAnswer(question, 'hoe gaat het').grade, 'good');
  assert.deepEqual(gradeTranslationAnswer(question, 'hoe gaat het'), { counted: true, grade: 'good', message: '✓ Правильно' });
});

test('gradeTranslationAnswer: punctuation inside a sentence is ignored, so the answer is good', () => {
  const sentence = { nl: 'goed, dank je wel. En met jou?', uk: 'добре, дякую. А з тобою?', article: '' };
  assert.equal(gradeTranslationAnswer(sentence, 'goed dank je wel en met jou').grade, 'good');
});

test("gradeTranslationAnswer: typographic apostrophe in the answer is the same as the stored one", () => {
  const morning = { nl: "'s ochtends", uk: 'вранці', article: '' };
  assert.equal(gradeTranslationAnswer(morning, '’s ochtends').grade, 'good');
  assert.equal(gradeTranslationAnswer(morning, "'s ochtends").grade, 'good');
});

test('gradeTranslationAnswer: a real spelling slip is still hard after normalisation', () => {
  const sentence = { nl: 'goed, dank je wel. En met jou?', uk: 'добре, дякую. А з тобою?', article: '' };
  const r = gradeTranslationAnswer(sentence, 'goed dank je wal en met jou?');
  assert.equal(r.grade, 'hard');
  assert.equal(r.message, 'Майже, перевір літери. Правильно: goed, dank je wel. En met jou?');
});

test('gradeTranslationAnswer: input that is only punctuation is not counted', () => {
  assert.equal(gradeTranslationAnswer(huis, '?').counted, false);
});

test('formatDutchWithArticle adds the article only when there is one', () => {
  assert.equal(formatDutchWithArticle(huis), 'het huis');
  assert.equal(formatDutchWithArticle(appel), 'appel');
});

test('revealTranslationAnswer ("Не знаю") is again and shows the word with its article', () => {
  assert.deepEqual(revealTranslationAnswer(huis), { counted: true, grade: 'again', message: '✗ Правильно: het huis' });
  assert.equal(revealTranslationAnswer(appel).message, '✗ Правильно: appel');
});

test('pluralizeDays: Ukrainian forms of "день"', () => {
  assert.equal(pluralizeDays(1), 'день');
  assert.equal(pluralizeDays(21), 'день');
  assert.equal(pluralizeDays(31), 'день');
  assert.equal(pluralizeDays(2), 'дні');
  assert.equal(pluralizeDays(3), 'дні');
  assert.equal(pluralizeDays(22), 'дні');
  assert.equal(pluralizeDays(5), 'днів');
  assert.equal(pluralizeDays(0), 'днів');
  assert.equal(pluralizeDays(11), 'днів');
  assert.equal(pluralizeDays(14), 'днів');
  assert.equal(pluralizeDays(111), 'днів');
});

test('formatDaysAway builds the phrase used in the next-review line', () => {
  assert.equal(formatDaysAway(1), 'через 1 день');
  assert.equal(formatDaysAway(3), 'через 3 дні');
  assert.equal(formatDaysAway(5), 'через 5 днів');
  assert.equal(formatDaysAway(21), 'через 21 день');
  assert.equal(formatDaysAway(11), 'через 11 днів');
});

test('formatLearningStatus maps the three statuses and shows unknown values as they are', () => {
  assert.equal(formatLearningStatus('new'), 'нове');
  assert.equal(formatLearningStatus('learning'), 'вивчається');
  assert.equal(formatLearningStatus('learned'), 'вивчено');
  assert.equal(formatLearningStatus('constructor'), 'constructor');
  assert.equal(formatLearningStatus(undefined), '');
});

test('buildNextReviewLine: interval, status and error count', () => {
  assert.equal(
    buildNextReviewLine({ intervalDays: 3, status: 'learning', errorCount: 2 }),
    'Наступне повторення: через 3 дні · вивчається · помилок: 2',
  );
  assert.equal(
    buildNextReviewLine({ intervalDays: 21, status: 'learned', errorCount: 0 }),
    'Наступне повторення: через 21 день · вивчено · помилок: 0',
  );
  assert.equal(
    buildNextReviewLine({ intervalDays: 1, status: 'new' }),
    'Наступне повторення: через 1 день · нове · помилок: 0',
  );
});

test('formatShortDate: ISO date to day.month, empty without a date', () => {
  assert.equal(formatShortDate('2026-10-25'), '25.10');
  assert.equal(formatShortDate('2026-01-03'), '03.01');
  assert.equal(formatShortDate(null), '');
  assert.equal(formatShortDate(undefined), '');
  assert.equal(formatShortDate('25.10.2026'), '');
});

test('advanceDrillQueue: a word typed right leaves the front of the queue', () => {
  assert.deepEqual(advanceDrillQueue(['a', 'b', 'c'], 'good'), ['b', 'c']);
  assert.deepEqual(advanceDrillQueue(['a'], 'good'), []);
});

test('advanceDrillQueue: wrong, hard and "Не знаю" answers send the word back into the queue, not first', () => {
  for (const grade of ['again', 'hard']) {
    const next = advanceDrillQueue(['a', 'b', 'c'], grade);
    assert.equal(next[0], 'b');
    assert.deepEqual([...next].sort(), ['a', 'b', 'c']);
  }
  assert.deepEqual(advanceDrillQueue(['a'], 'again'), ['a']);
});

test('advanceDrillQueue: returns a new array and leaves the queue it was given unchanged', () => {
  const queue = ['a', 'b'];
  const next = advanceDrillQueue(queue, 'again');
  assert.deepEqual(queue, ['a', 'b']);
  assert.notEqual(next, queue);
  assert.deepEqual(advanceDrillQueue([], 'good'), []);
});

test('formatStrugglingDrillButton: the button text carries the word count', () => {
  assert.equal(formatStrugglingDrillButton(3), 'Потренувати важкі слова (3)');
});

test('buildCustomDrillEnd: first-check count per direction out of all words, and the schedule note', () => {
  assert.deepEqual(buildCustomDrillEnd({ firstTry: { uk_nl: 2, nl_uk: 1 }, total: 3 }), {
    resultText: 'Готово! Правильно з першого разу: UA → NL 2 з 3 · NL → UA 1 з 3.',
    noteText: 'Тренування — розклад слів не змінюється.',
  });
  assert.equal(CUSTOM_DRILL_NOTE, 'Тренування — розклад слів не змінюється.');
  assert.equal(buildCustomDrillEnd({ firstTry: { uk_nl: 0, nl_uk: 0 }, total: 2 }).resultText,
    'Готово! Правильно з першого разу: UA → NL 0 з 2 · NL → UA 0 з 2.');
});

test('the deck line says the right answers still needed, a word learned just now, or a review answered right', async () => {
  const { buildDeckLine } = await import('../public/logic.js');
  const position = (inDeck, timesLeft) => ({ in_deck: inDeck, times_left: timesLeft });
  const deckWith = ({ uk, nl, hasLearned = false, hasLearnedDirection = false }) => ({
    in_deck: uk.in_deck || nl.in_deck,
    times_left: uk.times_left + nl.times_left,
    uk_nl: uk,
    nl_uk: nl,
    has_learned: hasLearned,
    has_learned_direction: hasLearnedDirection,
  });
  const inDeck = deckWith({ uk: position(true, 3), nl: position(true, 2) });
  assert.equal(buildDeckLine({ direction: 'uk_nl', deck: inDeck, intervalDays: 1 }), 'Повторень до вивчення: 3');
  assert.equal(buildDeckLine({ direction: 'nl_uk', deck: inDeck, intervalDays: 1 }), 'Повторень до вивчення: 2');
  const learned = deckWith({ uk: position(false, 0), nl: position(false, 0), hasLearned: true, hasLearnedDirection: true });
  assert.match(buildDeckLine({ direction: 'nl_uk', deck: learned, intervalDays: 6 }), /^Вивчено ✓ — наступне повторення: /);
  const outside = deckWith({ uk: position(false, 0), nl: position(false, 0) });
  assert.match(buildDeckLine({ direction: 'uk_nl', deck: outside, intervalDays: 30 }), /^Повторено ✓ — наступне повторення: /);
  // A review answered right in round 1 with its round 2 still to come: no review date yet.
  assert.equal(buildDeckLine({ direction: 'uk_nl', deck: outside, intervalDays: 1, isOtherRoundLeft: true }),
    'Правильно ✓ — далі NL → UA');
});

test('the deck line names the direction still to go when one direction is learned or answered right', async () => {
  const { buildDeckLine } = await import('../public/logic.js');
  const position = (inDeck, timesLeft) => ({ in_deck: inDeck, times_left: timesLeft });
  // UA → NL just learned, NL → UA still in the deck.
  const ukLearned = {
    in_deck: true, times_left: 2, uk_nl: position(false, 0), nl_uk: position(true, 2),
    has_learned: false, has_learned_direction: true,
  };
  assert.equal(buildDeckLine({ direction: 'uk_nl', deck: ukLearned, intervalDays: 1 }),
    'UA → NL вивчено ✓ — далі NL → UA');
  // NL → UA just learned, UA → NL still in the deck.
  const nlLearned = {
    in_deck: true, times_left: 1, uk_nl: position(true, 1), nl_uk: position(false, 0),
    has_learned: false, has_learned_direction: true,
  };
  assert.equal(buildDeckLine({ direction: 'nl_uk', deck: nlLearned, intervalDays: 1 }),
    'NL → UA вивчено ✓ — далі UA → NL');
  // A review answered right in UA → NL while NL → UA is still in the deck: no review date.
  const reviewRight = {
    in_deck: true, times_left: 2, uk_nl: position(false, 0), nl_uk: position(true, 2),
    has_learned: false, has_learned_direction: false,
  };
  assert.equal(buildDeckLine({ direction: 'uk_nl', deck: reviewRight, intervalDays: 6 }), 'Правильно ✓ — далі NL → UA');
  assert.doesNotMatch(buildDeckLine({ direction: 'uk_nl', deck: reviewRight, intervalDays: 6 }), /повторення/);
});

test('advanceWindowedQueue: a word not yet learned comes back after the other four active words, not the waiting ones', () => {
  const queue = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const linear = { isShuffled: false };
  assert.deepEqual(advanceWindowedQueue(queue, false, linear), ['b', 'c', 'd', 'e', 'a', 'f', 'g']);
  assert.deepEqual(advanceWindowedQueue(['a', 'b'], false, linear), ['b', 'a']);
  assert.deepEqual(advanceWindowedQueue(['a'], false, linear), ['a']);
  assert.deepEqual(advanceWindowedQueue(['a', 'b'], false), ['b', 'a']);
});

test('advanceWindowedQueue: a learned word leaves, so the first waiting word joins the active five', () => {
  assert.deepEqual(advanceWindowedQueue(['a', 'b', 'c', 'd', 'e', 'f'], true), ['b', 'c', 'd', 'e', 'f']);
});

test('advanceWindowedQueue: only five words rotate until one is learned', () => {
  let queue = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'];
  const shown = [];
  for (let step = 0; step < 30; step += 1) {
    shown.push(queue[0]);
    queue = advanceWindowedQueue(queue, false);
  }
  assert.deepEqual([...new Set(shown)].sort(), ['w1', 'w2', 'w3', 'w4', 'w5']);
  queue = advanceWindowedQueue(queue, true);
  assert.ok(queue.slice(0, 5).includes('w6'));
});

test('formatQueueProgress: names the five active words only while others wait', () => {
  assert.equal(formatQueueProgress(9), 'Залишилось: 9 · вчимо 5');
  assert.equal(formatQueueProgress(5), 'Залишилось: 5');
});

test('advanceWindowedQueue: shuffle mode puts the word at a random place among the active words, never first', () => {
  const queue = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(advanceWindowedQueue(queue, false, { random: () => 0 }), ['b', 'a', 'c', 'd', 'e', 'f']);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const next = advanceWindowedQueue(queue, false);
    const position = next.indexOf('a');
    assert.ok(position >= 1 && position <= 4);
    assert.deepEqual(next.slice(5), ['f']);
  }
});

test('shuffle: keeps every item, returns a new array', () => {
  const items = [1, 2, 3, 4, 5];
  const shuffled = shuffle(items);
  assert.notEqual(shuffled, items);
  assert.deepEqual([...shuffled].sort(), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
  assert.deepEqual(shuffle([]), []);
});

test('formatDuration: seconds, minutes with seconds, hours with minutes', () => {
  assert.equal(formatDuration(45), '45 с');
  assert.equal(formatDuration(750), '12 хв 30 с');
  assert.equal(formatDuration(600), '10 хв');
  assert.equal(formatDuration(3900), '1 год 5 хв');
});

test('pluralize: 1 помилка, 3 помилки, 5 і 11 помилок', () => {
  const forms = ['помилка', 'помилки', 'помилок'];
  assert.deepEqual([1, 3, 5, 11, 21].map(count => pluralize(count, forms)),
    ['помилка', 'помилки', 'помилок', 'помилок', 'помилка']);
});

test('buildRoundSummaryView: totals, the hardest word, the paused span only when there were pauses', () => {
  const round = {
    words: [
      { id: 1, nl: 'laten', uk: 'залишати', article: null, answer_count: 5, mistake_count: 3, difficulty: 'hard' },
      { id: 2, nl: 'kat', uk: 'кіт', article: 'de', answer_count: 2, mistake_count: 0, difficulty: 'easy' },
    ],
    total_count: 2, learned_count: 2, answer_count: 7, mistake_count: 3, hardest_word_id: 1,
    started_at: 0, finished_at: 3_600_000, active_seconds: 300,
  };
  const view = buildRoundSummaryView(round);
  assert.deepEqual(view.stats, [
    ['Вивчено слів', '2 з 2'],
    ['Час навчання', '5 хв'],
    ['Від початку до кінця, з перервами', '1 год'],
    ['Відповідей', '7'],
    ['Помилок', '3'],
  ]);
  assert.equal(view.hardestText, 'Найважче слово: laten — залишати (3 помилки)');
  assert.deepEqual(view.words[1], {
    dutch: 'de kat', ukrainian: 'кіт', difficulty: 'easy', difficultyLabel: 'легко',
    detail: 'відповідей: 2 · UA→NL: 0 · NL→UA: 0',
  });
  const smooth = buildRoundSummaryView({ ...round, hardest_word_id: null, finished_at: 300_000 });
  assert.equal(smooth.stats.length, 4);
  assert.equal(smooth.hardestText, 'Жодної помилки — чудово!');
});

test('buildActivityTiles: values and the comparison with the period before; none for all time', () => {
  const totals = {
    answers: 40, word_answers: 30, phrase_answers: 10, mistakes: 8, accuracy: 0.8, active_seconds: 900,
    days_practised: 3, new_words: 10, learned_words: 7,
  };
  const activity = {
    period: 'week', totals, previous_totals: { ...totals, answers: 30, accuracy: 0.85, active_seconds: 900 },
  };
  const tiles = buildActivityTiles(activity);
  assert.deepEqual(tiles[0], { label: 'Відповідей', value: '40', delta: '+10 · попередні 7 днів: 30' });
  assert.equal(tiles[1].value, '80%');
  assert.equal(tiles[1].delta, '−5 п.п. · попередні 7 днів: 85%');
  assert.equal(tiles[2].delta, '= · попередні 7 днів: 15 хв');
  assert.equal(buildActivityTiles({ ...activity, period: 'all', previous_totals: null })[0].delta, null);
  assert.equal(tiles[3].label, 'Днів з практикою');
  assert.ok(!buildActivityTiles({ ...activity, period: 'day' }).some(tile => tile.label === 'Днів з практикою'));
});

test('buildChartView: heights against the tallest bar, weekday labels for a week, sparse hour labels', () => {
  const week = buildChartView({
    unit: 'day',
    buckets: [
      { key: '2026-10-26', answers: 10, mistakes: 2, active_seconds: 300 },
      { key: '2026-10-27', answers: 5, mistakes: 0, active_seconds: 60 },
    ],
  }, 'week');
  assert.deepEqual(week.bars.map(bar => [bar.heightPercent, bar.label]), [[100, 'пн'], [50, 'вт']]);
  assert.equal(week.bars[0].detail, '26.10.2026: 10 відповідей · 2 помилки · 5 хв');
  const day = buildChartView({
    unit: 'hour',
    buckets: Array.from({ length: 24 }, (_, hour) => ({ key: String(hour), answers: 0, mistakes: 0, active_seconds: 0 })),
  }, 'day');
  assert.deepEqual(day.bars.filter(bar => bar.label).map(bar => bar.label), ['0:00', '6:00', '12:00', '18:00']);
  assert.equal(day.isEmpty, true);
});

test('formatActivityRange and buildStreakTiles', () => {
  assert.equal(formatActivityRange({ period: 'day', from_date: '2026-10-27', to_date: '2026-10-27' }),
    'Сьогодні: 27.10.2026');
  assert.equal(formatActivityRange({ period: 'week', from_date: '2026-10-21', to_date: '2026-10-27' }),
    'Останні 7 днів: 21.10.2026 – 27.10.2026');
  assert.deepEqual(buildStreakTiles({ current: 3, longest: 5, is_today_practised: false }).map(tile => tile.value),
    ['3 дні', '5 днів']);
});

const kat = { nl: 'kat', uk: 'кіт', article: 'de' };

test('gradeReverseTranslationAnswer: empty input is not counted', () => {
  assert.deepEqual(gradeReverseTranslationAnswer(kat, '   '),
    { counted: false, grade: null, message: 'Напиши відповідь українською' });
});

test('gradeReverseTranslationAnswer: the Ukrainian text is right, ignoring case and punctuation', () => {
  assert.deepEqual(gradeReverseTranslationAnswer(kat, 'кіт'), { counted: true, grade: 'good', message: '✓ Правильно' });
  assert.equal(gradeReverseTranslationAnswer(kat, '  КІТ! ').grade, 'good');
  assert.equal(gradeReverseTranslationAnswer({ nl: 'vlees', uk: 'м’ясо' }, "м'ясо").grade, 'good');
});

test('gradeReverseTranslationAnswer: the Ukrainian apostrophe ʼ and a backtick count as the usual apostrophe', () => {
  const name = { nl: 'naam', uk: "ім'я" };
  assert.equal(gradeReverseTranslationAnswer(name, 'імʼя').grade, 'good');
  assert.equal(gradeReverseTranslationAnswer(name, 'ім`я').grade, 'good');
  assert.equal(gradeReverseTranslationAnswer(name, 'ім’я').grade, 'good');
  assert.equal(gradeReverseTranslationAnswer(name, 'імя').grade, 'again');
});

test('gradeReverseTranslationAnswer: a wrong answer is again, shows the right one and may be overruled', () => {
  for (const input of ['кит', 'котик', 'кіта']) {
    assert.deepEqual(gradeReverseTranslationAnswer(kat, input),
      { counted: true, grade: 'again', message: '✗ Правильно: кіт', canOverride: true }, input);
  }
});

test('gradeReverseTranslationAnswer: dnk reveals the answer and is again without the override', () => {
  assert.deepEqual(gradeReverseTranslationAnswer(kat, 'DNK'), revealReverseTranslationAnswer(kat));
  assert.deepEqual(revealReverseTranslationAnswer(kat), { counted: true, grade: 'again', message: '✗ Правильно: кіт' });
  assert.equal(gradeReverseTranslationAnswer(kat, 'dnk').canOverride, undefined);
});

test('orderNextRound: a shuffled copy whose first card is never the last answered word', () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const original = [...cards];
  for (let seed = 0; seed < 30; seed += 1) {
    const order = orderNextRound(cards, 1, () => (seed % 7) / 7);
    assert.notEqual(order[0].id, 1);
    assert.deepEqual(order.map(card => card.id).sort(), [1, 2, 3]);
  }
  assert.deepEqual(cards, original);
  assert.deepEqual(orderNextRound(cards, 2, () => 0).map(card => card.id), [3, 2, 1]);
  assert.deepEqual(orderNextRound([{ id: 1 }], 1), [{ id: 1 }]);
});

test('formatRoundProgress and formatRoundStart name the round', () => {
  assert.equal(formatRoundProgress({ direction: 'uk_nl', queueLength: 7 }),
    'Раунд 1 з 2 · UA → NL · Залишилось: 7 · вчимо 5');
  assert.equal(formatRoundProgress({ direction: 'nl_uk', queueLength: 3 }), 'Раунд 2 з 2 · NL → UA · Залишилось: 3');
  assert.equal(formatRoundProgress({ direction: 'nl_uk', queueLength: 9, windowSize: Infinity }),
    'Раунд 2 з 2 · NL → UA · Залишилось: 9');
  assert.equal(formatRoundStart('nl_uk'), 'Раунд 2: NL → UA');
});

test('answerKey keys an answer by direction and card', () => {
  assert.equal(answerKey('uk_nl', 5), 'uk_nl:5');
  assert.deepEqual(ROUND_DIRECTIONS, ['uk_nl', 'nl_uk']);
});

test('splitIntoRounds: a card waits in each direction it has left and is not answered there', () => {
  const reviews = [
    { id: 1, directions_left: ['uk_nl', 'nl_uk'] },
    { id: 2, directions_left: ['nl_uk'] },
  ];
  const newCards = [{ id: 3, directions_left: ['uk_nl', 'nl_uk'] }];
  const rounds = splitIntoRounds({ reviews, newCards, answered: new Set(['uk_nl:1']) });
  assert.deepEqual(rounds.uk_nl.map(card => card.id), [3]);
  assert.deepEqual(rounds.nl_uk.map(card => card.id), [1, 2, 3]);
  // Reviews stay before new cards in each round, and the order function is applied to each part.
  const reversed = splitIntoRounds({ reviews, newCards, answered: new Set(), order: cards => [...cards].reverse() });
  assert.deepEqual(reversed.uk_nl.map(card => card.id), [1, 3]);
  assert.deepEqual(reversed.nl_uk.map(card => card.id), [2, 1, 3]);
});

test('planNextRound: round 1, then round 2 shuffled away from the last answered word', () => {
  const first = { id: 1 };
  const second = { id: 2 };
  const waiting = { uk_nl: [], nl_uk: [first, second] };
  const next = planNextRound({ direction: 'uk_nl', waiting }, 1, () => 0);
  assert.equal(next.direction, 'nl_uk');
  assert.notEqual(next.queue[0].id, 1);
  assert.deepEqual(next.waiting, { uk_nl: [], nl_uk: [] });
  assert.deepEqual(waiting.nl_uk, [first, second]);
});

test('planNextRound: an empty round is skipped; the first round keeps its order', () => {
  const card = { id: 7 };
  const onlyReverse = planNextRound({ direction: 'uk_nl', waiting: { uk_nl: [], nl_uk: [card] } }, 3);
  assert.equal(onlyReverse.direction, 'nl_uk');
  assert.deepEqual(onlyReverse.queue, [card]);
  const newSet = planNextRound({ direction: 'nl_uk', waiting: { uk_nl: [card], nl_uk: [] } }, 7);
  assert.equal(newSet.direction, 'uk_nl');
  assert.deepEqual(newSet.queue, [card]);
  assert.equal(planNextRound({ direction: 'nl_uk', waiting: { uk_nl: [], nl_uk: [] } }, 7), null);
});

test('buildRoundSummaryView: mistakes per direction on each word', () => {
  const round = {
    words: [{
      id: 1, nl: 'kat', uk: 'кіт', article: 'de', answer_count: 4, mistake_count: 1, difficulty: 'medium',
      mistakes: { uk_nl: 1, nl_uk: 0 },
    }],
    total_count: 1, learned_count: 1, answer_count: 4, mistake_count: 1, hardest_word_id: 1,
    started_at: 0, finished_at: 60_000, active_seconds: 60,
  };
  assert.equal(buildRoundSummaryView(round).words[0].detail, 'відповідей: 4 · UA→NL: 1 · NL→UA: 0');
});

// ---------- word-order exercise ----------

test('createWordOrderState puts every tile in the pile, unused, with an empty answer line', () => {
  const state = createWordOrderState(['de', 'man', 'loopt']);
  assert.deepEqual(state.pile, [
    { index: 0, text: 'de', used: false },
    { index: 1, text: 'man', used: false },
    { index: 2, text: 'loopt', used: false },
  ]);
  assert.deepEqual(state.answer, []);
  assert.deepEqual(readAnswerTiles(state), []);
});

test('placeTile moves a pile tile to the end of the answer line and keeps its pile place', () => {
  const start = createWordOrderState(['de', 'man', 'loopt']);
  const once = placeTile(start, 2);
  const twice = placeTile(once, 0);
  assert.deepEqual(twice.answer, [2, 0]);
  assert.deepEqual(readAnswerTiles(twice), ['loopt', 'de']);
  assert.equal(twice.pile[2].used, true);
  assert.equal(twice.pile[0].used, true);
  assert.equal(twice.pile[1].used, false);
  assert.equal(twice.pile[0].text, 'de', 'the placed tile keeps its text and place in the pile');
  assert.deepEqual(start.answer, [], 'the old state is not changed');
});

test('placeTile ignores a used tile, an unknown index and leaves the state as it was', () => {
  const state = placeTile(createWordOrderState(['a', 'b']), 0);
  assert.equal(placeTile(state, 0), state);
  assert.equal(placeTile(state, 5), state);
  assert.equal(placeTile(state, -1), state);
});

test('returnTile sends an answer tile back to its own place in the pile', () => {
  let state = createWordOrderState(['de', 'man', 'loopt', 'hond']);
  state = placeTile(state, 3);
  state = placeTile(state, 1);
  state = placeTile(state, 0);
  // answer is [3, 1, 0]; returning the middle tile (man) leaves [3, 0].
  const back = returnTile(state, 1);
  assert.deepEqual(back.answer, [3, 0]);
  assert.equal(back.pile[1].used, false);
  assert.deepEqual(readAnswerTiles(back), ['hond', 'de']);
  assert.deepEqual(readAnswerTiles(state), ['hond', 'man', 'de'], 'the old state is not changed');
});

test('returnTile ignores a position outside the answer line', () => {
  const state = placeTile(createWordOrderState(['a', 'b']), 1);
  assert.equal(returnTile(state, 1), state);
  assert.equal(returnTile(state, -1), state);
  assert.equal(returnTile(state, 0.5), state);
});

test('duplicate words keep their own pile places, so each copy can be placed and returned', () => {
  let state = createWordOrderState(['de', 'huis', 'de']);
  state = placeTile(state, 2);
  state = placeTile(state, 0);
  assert.deepEqual(readAnswerTiles(state), ['de', 'de']);
  // answer is [2, 0]; returning position 0 frees pile index 2 and leaves the first 'de' in the answer line.
  state = returnTile(state, 0);
  assert.equal(state.pile[2].used, false);
  assert.equal(state.pile[0].used, true);
  assert.deepEqual(readAnswerTiles(state), ['de']);
});

test('formatWordOrderProgress and formatWordOrderSummary', () => {
  assert.equal(formatWordOrderProgress(3, 10), 'Речення 3 з 10');
  assert.equal(formatWordOrderSummary(8, 10), 'Готово: 8 з 10 правильно');
});

test('buildWordOrderCheckView shows green for a right answer and the correct sentence for a wrong one', () => {
  assert.deepEqual(buildWordOrderCheckView({ is_correct: true, correct_nl: 'Ik woon hier.' }),
    { message: 'Правильно ✓', tone: 'ok', mainOrderLine: null, otherOrdersTitle: null, otherOrders: [] });
  assert.deepEqual(buildWordOrderCheckView({ is_correct: false, correct_nl: 'Ik woon hier.' }),
    { message: 'Правильно: Ik woon hier.', tone: 'bad', mainOrderLine: null, otherOrdersTitle: null, otherOrders: [] });
});

test('buildWordOrderCheckView: a right answer that is the main order has no extra line', () => {
  const view = buildWordOrderCheckView({
    is_correct: true, correct_nl: 'Ik neem een drankje omdat ik dorst heb.', matched_order: 0,
    orders: ['ik neem een drankje omdat ik dorst heb', 'omdat ik dorst heb ik neem een drankje'], has_other_orders: true,
  });
  assert.equal(view.message, 'Правильно ✓');
  assert.equal(view.tone, 'ok');
  assert.equal(view.mainOrderLine, null);
  assert.deepEqual(view.otherOrders, []);
});

test('buildWordOrderCheckView: a right alternative names the main order', () => {
  const view = buildWordOrderCheckView({
    is_correct: true, correct_nl: 'Ik neem een drankje omdat ik dorst heb.', matched_order: 1,
    orders: ['ik neem een drankje omdat ik dorst heb', 'omdat ik dorst heb ik neem een drankje'], has_other_orders: true,
  });
  assert.equal(view.message, 'Правильно ✓');
  assert.equal(view.tone, 'ok');
  // The canonical sentence with its punctuation (correct_nl), not the bare tile string of orders[0].
  assert.equal(view.mainOrderLine, 'Основний варіант: Ik neem een drankje omdat ik dorst heb.');
  assert.deepEqual(view.otherOrders, []);
});

test('buildWordOrderCheckView: a wrong answer shows the correct sentence and the other orders', () => {
  const view = buildWordOrderCheckView({
    is_correct: false, correct_nl: 'Ik neem een drankje omdat ik dorst heb.', matched_order: -1,
    orders: ['ik neem een drankje omdat ik dorst heb', 'omdat ik dorst heb ik neem een drankje', 'ik dorst heb een drankje'],
    has_other_orders: true,
  });
  assert.equal(view.message, 'Правильно: Ik neem een drankje omdat ik dorst heb.');
  assert.equal(view.tone, 'bad');
  assert.equal(view.mainOrderLine, null);
  assert.equal(view.otherOrdersTitle, 'Є й інші правильні варіанти:');
  assert.deepEqual(view.otherOrders, ['omdat ik dorst heb ik neem een drankje', 'ik dorst heb een drankje']);
});

test('buildWordOrderCheckView: a wrong answer with one accepted order has no other-orders list', () => {
  const view = buildWordOrderCheckView({
    is_correct: false, correct_nl: 'Ik woon hier.', matched_order: -1, orders: ['ik woon hier'], has_other_orders: false,
  });
  assert.equal(view.otherOrdersTitle, null);
  assert.deepEqual(view.otherOrders, []);
});

test('buildWordOrderCheckView: a missing orders list is treated as none (older server)', () => {
  const view = buildWordOrderCheckView({ is_correct: true, correct_nl: 'Ik woon hier.', matched_order: 1 });
  assert.equal(view.mainOrderLine, null);
  assert.deepEqual(view.otherOrders, []);
});

test('formatOrderCountLabel: one order or several; a missing or zero count is one order', () => {
  assert.equal(formatOrderCountLabel(1), 'Один правильний порядок');
  assert.equal(formatOrderCountLabel(2), 'Можливо кілька порядків');
  assert.equal(formatOrderCountLabel(4), 'Можливо кілька порядків');
  assert.equal(formatOrderCountLabel(0), 'Один правильний порядок');
  assert.equal(formatOrderCountLabel(undefined), 'Один правильний порядок');
  assert.equal(formatOrderCountLabel(null), 'Один правильний порядок');
});

test('buildAlsoOrderLines: one muted «також» line per alternative, none for an empty list', () => {
  assert.deepEqual(buildAlsoOrderLines(['Omdat ik dorst heb, neem ik een drankje.', 'Ik neem een drankje, omdat ik dorst heb.']),
    ['також: Omdat ik dorst heb, neem ik een drankje.', 'також: Ik neem een drankje, omdat ik dorst heb.']);
  assert.deepEqual(buildAlsoOrderLines([]), []);
  assert.deepEqual(buildAlsoOrderLines(undefined), []);
  assert.deepEqual(buildAlsoOrderLines(['  ', 'Ik woon hier.']), ['також: Ik woon hier.']);
});

test('formatSentenceStats reads the answer counts', () => {
  assert.equal(formatSentenceStats({ times_answered: 4, times_correct: 3 }), '✓ 3 / 4');
  assert.equal(formatSentenceStats({ times_answered: 0, times_correct: 0 }), 'ще не відповідали');
  assert.equal(formatSentenceStats({}), 'ще не відповідали');
});

test('formatImportResult counts added and skipped sentences and bad rows', () => {
  assert.equal(formatImportResult({ added: [{}, {}, {}], skipped: [{}] }), 'Додано 3, пропущено 1');
  assert.equal(formatImportResult({ added: [], skipped: [], errors: ['рядок 2: порожнє'] }),
    'Додано 0, пропущено 0; рядків з помилками: 1');
});

test('formatImportResult also reports updated sentences and dropped schemas, and the generate result shape', () => {
  assert.equal(formatImportResult({ added: [{}], updated: [{}, {}], skipped: [], warnings: [{}] }),
    'Додано 1, пропущено 0; оновлено 2; схем відкинуто 1');
  assert.equal(formatImportResult({ added: [{}], updated: [], skipped: [], warnings: [] }), 'Додано 1, пропущено 0');
  assert.equal(formatImportResult({ added: [], updated: [{}], skipped: [{}], warnings: [], errors: ['x'] }),
    'Додано 0, пропущено 1; оновлено 1; рядків з помилками: 1');
  assert.equal(formatImportResult({}), 'Додано 0, пропущено 0');
});

test('shouldApplyFetch: a replace still applies when a later live refresh resolved first', () => {
  // replace 1 requested, live 2 resolved first (applied), then replace 1 resolves.
  const afterLive = { appliedFetch: 2, appliedReplace: 0, pendingReplace: 1 };
  assert.equal(shouldApplyFetch({ fetchNo: 1, replace: true, ...afterLive }), true);
});

test('shouldApplyFetch: a replace is dropped only when a newer replace was already applied', () => {
  assert.equal(shouldApplyFetch({ fetchNo: 1, replace: true, appliedFetch: 2, appliedReplace: 2, pendingReplace: 2 }), false);
  assert.equal(shouldApplyFetch({ fetchNo: 2, replace: true, appliedFetch: 1, appliedReplace: 1, pendingReplace: 2 }), true);
});

test('shouldApplyFetch: a live refresh older than an applied live one is dropped', () => {
  assert.equal(shouldApplyFetch({ fetchNo: 3, replace: false, appliedFetch: 4, appliedReplace: 0, pendingReplace: 0 }), false);
  assert.equal(shouldApplyFetch({ fetchNo: 5, replace: false, appliedFetch: 4, appliedReplace: 0, pendingReplace: 0 }), true);
});

test('shouldApplyFetch: a live refresh started before a pending replace is dropped (its rules may be old)', () => {
  assert.equal(shouldApplyFetch({ fetchNo: 2, replace: false, appliedFetch: 0, appliedReplace: 0, pendingReplace: 3 }), false);
  assert.equal(shouldApplyFetch({ fetchNo: 4, replace: false, appliedFetch: 0, appliedReplace: 0, pendingReplace: 3 }), true);
});

test('chooseFocusAfterPlace keeps the pile index if free, else the next free tile, else «Перевірити»', () => {
  let state = createWordOrderState(['a', 'b', 'c']);
  state = placeTile(state, 0);
  assert.deepEqual(chooseFocusAfterPlace(state, 0), { kind: 'pile', index: 1 });
  state = placeTile(state, 1);
  state = placeTile(state, 2);
  assert.deepEqual(chooseFocusAfterPlace(state, 2), { kind: 'check' });
});

test('chooseFocusAfterReturn focuses the answer tile at the position, else the last one, else the pile', () => {
  let state = createWordOrderState(['a', 'b', 'c']);
  state = placeTile(placeTile(placeTile(state, 0), 1), 2);
  // answer is [0, 1, 2]; returning position 1 leaves [0, 2]: the tile now at position 1 is 'c'.
  const middle = returnTile(state, 1);
  assert.deepEqual(chooseFocusAfterReturn(middle, 1), { kind: 'answer', position: 1 });
  // returning the last tile: position 2 is past the end, so the new last tile is focused.
  const last = returnTile(state, 2);
  assert.deepEqual(chooseFocusAfterReturn(last, 2), { kind: 'answer', position: 1 });
  // returning the only tile: no answer left, so the first free pile tile is focused.
  const only = returnTile(placeTile(createWordOrderState(['a', 'b']), 1), 0);
  assert.deepEqual(chooseFocusAfterReturn(only, 0), { kind: 'pile', index: 0 });
});

test('chooseFirstPileFocus picks the first free pile tile, null when none is free', () => {
  const state = placeTile(createWordOrderState(['a', 'b']), 0);
  assert.deepEqual(chooseFirstPileFocus(state), { kind: 'pile', index: 1 });
  assert.equal(chooseFirstPileFocus(createWordOrderState([])), null);
});

test('skipSentenceInSet drops the sentence on screen and points at the next one', () => {
  const sentences = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(skipSentenceInSet({ sentences, index: 1 }), { sentences: [{ id: 1 }, { id: 3 }], index: 1 });
  assert.deepEqual(skipSentenceInSet({ sentences, index: 2 }), { sentences: [{ id: 1 }, { id: 2 }], index: 2 });
  assert.deepEqual(skipSentenceInSet({ sentences: [{ id: 1 }], index: 0 }), { sentences: [], index: 0 });
  assert.deepEqual(sentences, [{ id: 1 }, { id: 2 }, { id: 3 }], 'the old set is not changed');
});

// ---------- word-order rule filter and schema ----------

test('WORD_ORDER_RULES lists the nine rules of the filter, each with a Ukrainian name', () => {
  assert.equal(WORD_ORDER_RULES.length, 9);
  assert.deepEqual(WORD_ORDER_RULES, ['v2', 'inversion', 'question', 'modal', 'separable', 'negation', 'subordinate', 'perfect', 'none']);
  for (const rule of WORD_ORDER_RULES) assert.ok(RULE_LABELS[rule], rule);
  assert.equal(RULE_LABELS.v2, 'Дієслово на 2-му місці');
});

test('ruleLabel names a rule, null as «Без правила», and keeps an unknown name as it is', () => {
  assert.equal(ruleLabel('inversion'), 'Інверсія');
  assert.equal(ruleLabel(null), 'Без правила');
  assert.equal(ruleLabel('toString'), 'toString');
});

test('formatRuleFilterSummary says «усі» for every rule, else how many of nine', () => {
  assert.equal(formatRuleFilterSummary(WORD_ORDER_RULES), 'Правила: усі');
  assert.equal(formatRuleFilterSummary(['v2', 'none', 'modal']), 'Правила: 3 з 9');
  assert.equal(formatRuleFilterSummary([]), 'Правила: 0 з 9');
});

test('buildRulesQuery lists the chosen rules in dropdown order, and nothing when all are chosen', () => {
  assert.equal(buildRulesQuery(WORD_ORDER_RULES), '');
  assert.equal(buildRulesQuery(['none', 'v2', 'inversion']), 'v2,inversion,none');
  assert.equal(buildRulesQuery(['perfect']), 'perfect');
  assert.equal(buildRulesQuery([]), '', 'none chosen: the caller makes no request');
});

test('parseStoredRules reads the saved choice, defaults to all, and drops unknown names', () => {
  assert.deepEqual(parseStoredRules(null), WORD_ORDER_RULES);
  assert.deepEqual(parseStoredRules('not json'), WORD_ORDER_RULES);
  assert.deepEqual(parseStoredRules('{"v2":true}'), WORD_ORDER_RULES);
  assert.deepEqual(parseStoredRules('["none","v2","bogus"]'), ['v2', 'none']);
  assert.deepEqual(parseStoredRules('[]'), []);
});

test('formatStructureLine joins the roles with « > », and is empty without a schema', () => {
  const structure = [
    { text: 'Deze week', role: 'час' },
    { text: 'ben', role: 'дієслово' },
    { text: 'ik', role: 'підмет' },
    { text: 'jarig', role: 'прикметник' },
  ];
  assert.equal(formatStructureLine(structure), 'час > дієслово > підмет > прикметник');
  assert.equal(formatStructureLine(null), '');
  assert.equal(formatStructureLine([]), '');
});

test('roleColourClass groups the 16 schema roles into a few colours, and other roles into role-other', () => {
  assert.equal(roleColourClass('підмет'), 'role-subject');
  assert.equal(roleColourClass('модальне дієслово'), 'role-verb');
  assert.equal(roleColourClass('інфінітив'), 'role-verb');
  assert.equal(roleColourClass('відокремлювана частина'), 'role-verb');
  assert.equal(roleColourClass('додаток'), 'role-object');
  assert.equal(roleColourClass('причина'), 'role-adverbial');
  assert.equal(roleColourClass('заперечення'), 'role-negation');
  assert.equal(roleColourClass('питальне слово'), 'role-connector');
  assert.equal(roleColourClass('прикметник'), 'role-adjective');
  assert.equal(roleColourClass(' Підмет '), 'role-subject');
  assert.equal(roleColourClass('щось інше'), 'role-other');
  assert.equal(roleColourClass(undefined), 'role-other');
  assert.equal(roleColourClass('частка'), 'role-adverbial');
});

// ---------- custom drill (pure helpers and the no-grading guard) ----------

const wordsOf = ids => ids.map(id => ({ id, nl: `woord${id}`, uk: `слово${id}`, article: null }));

test('planCustomDrill: round 1 holds the words in the given order, round 2 waits with all of them', () => {
  const words = wordsOf([1, 2, 3]);
  const plan = planCustomDrill(words);
  assert.equal(plan.direction, 'uk_nl');
  assert.deepEqual(plan.queue.map(word => word.id), [1, 2, 3]);
  assert.deepEqual(plan.waiting, { uk_nl: [], nl_uk: words });
  assert.equal(plan.lastAnsweredId, null);
  const reversed = planCustomDrill(words, list => [...list].reverse());
  assert.deepEqual(reversed.queue.map(word => word.id), [3, 2, 1]);
});

test('planCustomDrill: the input words are not changed, and two plans do not share arrays', () => {
  const words = wordsOf([1, 2]);
  const first = planCustomDrill(words);
  const second = planCustomDrill(words);
  first.queue.pop();
  first.waiting.nl_uk.pop();
  assert.deepEqual(words.map(word => word.id), [1, 2]);
  assert.deepEqual(second.queue.map(word => word.id), [1, 2]);
  assert.deepEqual(second.waiting.nl_uk.map(word => word.id), [1, 2]);
});

test('custom drill rounds: after round 1 the next round starts with a word other than the last answered one', () => {
  for (let seed = 0; seed < 8; seed++) {
    const words = wordsOf([1, 2, 3, 4]);
    const plan = planCustomDrill(words);
    const random = () => (seed % 5) / 5;
    const round2 = planNextRound(plan, 4, random);
    assert.equal(round2.direction, 'nl_uk');
    assert.deepEqual(round2.queue.map(word => word.id).sort(), [1, 2, 3, 4]);
    assert.notEqual(round2.queue[0].id, 4);
  }
  // A single word in round 1 is also round 2 (nothing to reorder).
  const single = planNextRound(planCustomDrill(wordsOf([9])), 9, () => 0);
  assert.deepEqual(single.queue.map(word => word.id), [9]);
});

test('formatCustomDrillProgress: the title, the round and the words left; the rotation part only past the window', () => {
  assert.equal(formatCustomDrillProgress({ title: 'Важкі слова', direction: 'uk_nl', queueLength: 3 }),
    'Важкі слова · Раунд 1 з 2 · UA → NL · Залишилось: 3');
  assert.equal(formatCustomDrillProgress({ title: 'Колода: Тест', direction: 'nl_uk', queueLength: 7 }),
    'Колода: Тест · Раунд 2 з 2 · NL → UA · Залишилось: 7 · вчимо 5');
});

test('buildRoundDrillButtons: hard, and hard plus medium, in the round order; a button with no words is hidden', () => {
  const round = [
    { id: 5, difficulty: 'hard' },
    { id: 2, difficulty: 'medium' },
    { id: 9, difficulty: 'hard' },
    { id: 4, difficulty: 'easy' },
  ];
  const [hard, hardMedium] = buildRoundDrillButtons(round);
  assert.deepEqual(hard, {
    kind: 'hard', title: 'Повторити важкі', count: 2, wordIds: [5, 9], label: 'Повторити важкі (2)', hidden: false,
  });
  assert.deepEqual(hardMedium, {
    kind: 'hard-medium', title: 'Важкі й середні', count: 3, wordIds: [5, 2, 9], label: 'Важкі й середні (3)', hidden: false,
  });
  const easyOnly = buildRoundDrillButtons([{ id: 1, difficulty: 'easy' }]);
  assert.deepEqual(easyOnly.map(button => [button.count, button.hidden]), [[0, true], [0, true]]);
  const mediumOnly = buildRoundDrillButtons([{ id: 1, difficulty: 'medium' }]);
  assert.deepEqual(mediumOnly.map(button => [button.count, button.hidden]), [[0, true], [1, false]]);
});

test('the drill helpers are pure: same input, same output, and the input is not changed', () => {
  const round = [{ id: 1, difficulty: 'hard' }, { id: 2, difficulty: 'medium' }];
  const snapshot = JSON.stringify(round);
  assert.deepEqual(buildRoundDrillButtons(round), buildRoundDrillButtons(round));
  assert.equal(JSON.stringify(round), snapshot);
  const words = wordsOf([1, 2]);
  assert.deepEqual(planCustomDrill(words, list => list), planCustomDrill(words, list => list));
  assert.equal(JSON.stringify(words), JSON.stringify(wordsOf([1, 2])));
});

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '..', 'public', 'app.js'), 'utf8');
const logicSource = fs.readFileSync(path.join(here, '..', 'public', 'logic.js'), 'utf8');

test('the page keeps the filter chips at least 44px tall', () => {
  const css = fs.readFileSync(path.join(here, '..', 'public', 'app.css'), 'utf8');
  assert.match(css, /\.deck-chips button \{\s*min-height: 44px;/);
});

test('logic.js has no network or API access, so its drill helpers cannot post anything', () => {
  assert.doesNotMatch(logicSource, /^import\s/m);
  assert.doesNotMatch(logicSource, /\bfetch\s*\(|api\.|recordResult|gradePractice/);
});

test('the custom drill section of app.js calls no grading API (only the two reads)', () => {
  const start = appSource.indexOf('// ---------- 3b · Custom drill');
  const end = appSource.indexOf('// ---------- 4 · Правила ----------');
  assert.ok(start > 0 && end > start, 'section 3b is found');
  const section = appSource.slice(start, end);
  const calls = [...section.matchAll(/\bapi\.(\w+)/g)].map(match => match[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['getDrillWords', 'getStrugglingWords']);
  assert.doesNotMatch(section, /recordResult|gradePracticeWord|gradePracticePhrase|recordFsrsAnswer|postFsrsGrade|postPhraseGrade|gradeCardPhrase|answerFsrsWord|trackPendingPost/);
});

// ---------- Колоди (decks) ----------

const catalogWords = [
  { id: 1, nl: 'één', article: null, uk: 'один', difficulty: 'hard', mistake_count: 4, answer_count: 6, last_practiced_on: '2026-10-20' },
  { id: 2, nl: 'huis', article: 'het', uk: 'дім', difficulty: 'easy', mistake_count: 0, answer_count: 3, last_practiced_on: '2025-03-02' },
  { id: 3, nl: 'boek', article: 'het', uk: 'книга', difficulty: 'medium', mistake_count: 2, answer_count: 5, last_practiced_on: null },
  { id: 4, nl: 'Zee', article: 'de', uk: 'море', difficulty: null, mistake_count: 0, answer_count: 0, last_practiced_on: null },
  { id: 5, nl: 'café', article: 'het', uk: 'кав’ярня', difficulty: 'hard', mistake_count: 3, answer_count: 4, last_practiced_on: '2026-10-28' },
  { id: 6, nl: 'ander', article: null, uk: 'інший', difficulty: 'medium', mistake_count: 1, answer_count: 2, last_practiced_on: '2026-10-01' },
];
const ids = words => words.map(word => word.id);

test('foldSearchText ignores case, accents and Ukrainian й/ї marks, and unifies apostrophes', () => {
  assert.equal(foldSearchText('Café'), 'cafe');
  assert.equal(foldSearchText('ÉÉN  één'), 'een een');
  assert.equal(foldSearchText('ЇЖАК'), foldSearchText('їжак'));
  assert.equal(foldSearchText('ім’я'), foldSearchText("ім'я"));
  assert.equal(foldSearchText(null), '');
});

test('foldSearchText keeps Ukrainian й and ї apart from и and і, and still folds Latin accents', () => {
  assert.notEqual(foldSearchText('йогурт'), foldSearchText('иогурт'));
  assert.notEqual(foldSearchText('їжак'), foldSearchText('іжак'));
  assert.equal(foldSearchText('Й'), 'й');
  assert.equal(foldSearchText('Ї'), 'ї');
  assert.equal(foldSearchText('йогурт'), 'йогурт');
  // A decomposed й (и + breve) is the same letter as the composed one, and still not и.
  assert.equal(foldSearchText('и\u0306'), foldSearchText('й'));
  assert.notEqual(foldSearchText('и\u0306'), foldSearchText('и'));
  assert.equal(foldSearchText('e\u0301n'), 'en');
  assert.equal(foldSearchText('één'), 'een');
});

test('filterCatalog: a Ukrainian й word is not found by the letter и', () => {
  const words = [{ id: 9, nl: 'yoghurt', article: 'de', uk: 'йогурт' }];
  assert.deepEqual(ids(filterCatalog({ words, query: 'иогурт' })), []);
  assert.deepEqual(ids(filterCatalog({ words, query: 'йогурт' })), [9]);
});

test('filterCatalog: the search matches Dutch and Ukrainian, case and accent free', () => {
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'CAFE' })), [5]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'één' })), [1]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'ОДИН' })), [1]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'кав’ярня' })), [5]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'het' })), [2, 3, 5], 'the article is searched too');
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'het boek' })), [3], 'a multi-word query is a substring');
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, query: 'het huis' })), [2]);
});

test('filterCatalog: the bucket filters, the new bucket is a never-answered word, selected uses the given ids', () => {
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'hard' })), [1, 5]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'medium' })), [3, 6]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'easy' })), [2]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'new' })), [4]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'selected', selectedIds: new Set([6, 2]) })), [2, 6]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'selected', selectedIds: [] })), []);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords, filter: 'hard', query: 'café' })), [5]);
  assert.deepEqual(ids(filterCatalog({ words: catalogWords })), [1, 2, 3, 4, 5, 6], 'no filter, no query: all, in order');
});

test('filterCatalog returns new arrays and does not change the words', () => {
  const copy = JSON.stringify(catalogWords);
  const result = filterCatalog({ words: catalogWords, query: 'a' });
  assert.notEqual(result, catalogWords);
  assert.equal(JSON.stringify(catalogWords), copy);
});

test('sortCatalog: alpha by the Dutch word (accent and case free), hardest first with new words last, stale first', () => {
  // alpha: ander, boek, café (cafe), één (een), huis, Zee
  assert.deepEqual(ids(sortCatalog(catalogWords, 'alpha')), [6, 3, 5, 1, 2, 4]);
  // hardest: hard (4 mistakes, then 3), medium (2 then 1), easy, new last
  assert.deepEqual(ids(sortCatalog(catalogWords, 'hardest')), [1, 5, 3, 6, 2, 4]);
  // stale: never practised first, then the oldest date
  assert.deepEqual(ids(sortCatalog(catalogWords, 'stale')), [3, 4, 2, 6, 1, 5]);
  assert.deepEqual(ids(sortCatalog(catalogWords, 'nonsense')), [6, 3, 5, 1, 2, 4], 'an unknown sort is alpha');
});

test('sortCatalog returns a new array and leaves the input order', () => {
  const before = ids(catalogWords);
  const sorted = sortCatalog(catalogWords, 'hardest');
  assert.notEqual(sorted, catalogWords);
  assert.deepEqual(ids(catalogWords), before);
});

test('formatLastPracticed: DD.MM this year, with the year otherwise, «ще не практиковано» for none', () => {
  assert.equal(formatLastPracticed('2026-10-28', '2026-10-29'), 'востаннє: 28.10');
  assert.equal(formatLastPracticed('2025-03-02', '2026-10-29'), 'востаннє: 02.03.2025');
  assert.equal(formatLastPracticed(null, '2026-10-29'), 'ще не практиковано');
  assert.equal(formatLastPracticed('', '2026-10-29'), 'ще не практиковано');
  assert.equal(formatLastPracticed('2026-10-28', ''), 'востаннє: 28.10.2026', 'no today: the year is shown');
});

test('formatDeckWordCount uses Ukrainian plurals: 1 слово, 2 слова, 5 слів, 11 слів, 21 слово', () => {
  const expected = { 0: '0 слів', 1: '1 слово', 2: '2 слова', 3: '3 слова', 4: '4 слова', 5: '5 слів', 11: '11 слів',
    12: '12 слів', 14: '14 слів', 21: '21 слово', 22: '22 слова', 25: '25 слів', 101: '101 слово', 112: '112 слів' };
  for (const [count, text] of Object.entries(expected)) {
    assert.equal(formatDeckWordCount(Number(count)), text, `count ${count}`);
  }
});

test('formatDeckWordLabel puts the article first; formatDifficultyLabel names the bucket, «нове» for none', () => {
  assert.equal(formatDeckWordLabel({ nl: 'huis', article: 'het', uk: 'дім' }), 'het huis — дім');
  assert.equal(formatDeckWordLabel({ nl: 'één', article: null, uk: 'один' }), 'één — один');
  assert.equal(formatDifficultyLabel('hard'), 'важко');
  assert.equal(formatDifficultyLabel('medium'), 'середньо');
  assert.equal(formatDifficultyLabel('easy'), 'легко');
  assert.equal(formatDifficultyLabel(null), 'нове');
});

test('selection model: toggle adds and removes, select visible adds only those, clear empties; no input is changed', () => {
  const start = new Set([2]);
  const added = toggleSelected(start, 5);
  assert.deepEqual([...added], [2, 5]);
  assert.deepEqual([...toggleSelected(added, 2)], [5]);
  assert.deepEqual([...start], [2], 'the given set is not changed');
  assert.deepEqual([...selectVisible(new Set([2]), [3, 4, 2])], [2, 3, 4]);
  assert.deepEqual([...selectVisible(new Set(), [])], []);
  assert.equal(clearSelected().size, 0);
  assert.equal(formatSelectedCount(3), 'Обрано: 3');
  assert.equal(formatSelectedCount(0), 'Обрано: 0');
});

test('TAB_TITLES names the decks tab «Колоди»', () => {
  assert.equal(TAB_TITLES.decks, 'Колоди');
});

// The body of a top-level function in app.js or logic.js: from its signature to the closing brace at column 0.
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} is found`);
  return source.slice(start, source.indexOf('\n}\n', start));
}

test('grading dispatch outside section 3b: custom and struggling modes never reach a grading call', () => {
  // submitPractice: only the FSRS mode grades (submitFsrsAnswer); the custom drill and its struggling mode take the drill.
  assert.match(functionBody(appSource, 'function submitPractice() {'),
    /if \(ui\.practice\.mode === 'fsrs'\) submitFsrsAnswer\(\);\s*else if \(isCustomPracticeMode\(\)\) submitCustomAnswer\(\);/);
  // handlePracticeSkipClick: «Не знаю» in the drill reveals without a post.
  assert.match(functionBody(appSource, 'function handlePracticeSkipClick() {'),
    /if \(isCustomPracticeMode\(\)\) revealCustomAnswer\(\);\s*else revealFsrsAnswer\(\);/);
  // The «Я мав рацію» listener: the drill's override, never the FSRS grade.
  assert.match(appSource, /addEventListener\('click', \(\) => \{\s*if \(isCustomPracticeMode\(\)\) overrideCustomAnswer\(\);\s*else handleOverrideClick\(\);/);
  // The mode select: a custom drill never starts the FSRS session or a grade.
  assert.match(appSource, /if \(choice === 'custom'\) \{\s*renderPractice\(\);\s*return;/);
});

test('leaving the custom drill puts the daily practice back for every target, except onBack', () => {
  const body = functionBody(appSource, 'function leaveCustomDrill() {');
  assert.ok(body.indexOf("if (onBack)") < body.indexOf("ui.practice.mode = 'fsrs'"), 'onBack runs before the mode is reset');
  assert.ok(body.indexOf("ui.practice.mode = 'fsrs'") < body.indexOf("name === 'decks'"), 'the mode is reset before the decks tab');
  assert.match(functionBody(appSource, 'function showTab(name) {'),
    /if \(ui\.custom\.status === 'idle' && isCustomPracticeMode\(\)\) ui\.practice\.mode = 'fsrs';/);
});

test('the struggling drill keeps its own name in the mode select; the other drills run as custom', () => {
  assert.match(functionBody(appSource, 'function startCustomDrill('), /mode = 'custom'\s*}\) \{/);
  assert.match(functionBody(appSource, 'async function startStrugglingDrill() {'), /mode: 'struggling'/);
  assert.match(fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8'), /<option value="custom" hidden disabled>/);
});

test('async starts: a drill does not pull the learner back to another tab, and the buttons wait while it loads', () => {
  for (const signature of ['async function practiceDeck(deck) {', 'async function handleRoundDrillClick(kind) {', 'async function editDeck(id) {']) {
    assert.match(functionBody(appSource, signature), /const startTab = ui\.tab;[\s\S]*ui\.tab !== startTab/, signature);
  }
  const roundBody = functionBody(appSource, 'async function handleRoundDrillClick(kind) {');
  assert.match(roundBody, /!button\.count \|\| roundDrillBusy\)/);
  assert.match(roundBody, /setRoundDrillsBusy\(true\)/);
  assert.match(functionBody(appSource, 'async function practiceDeck(deck) {'), /setDeckBusy\(true\)[\s\S]*setDeckBusy\(false\)/);
});

test('advanceFsrsWord leaves the input alone when another mode is on screen after its await', () => {
  assert.match(functionBody(appSource, 'async function advanceFsrsWord() {'),
    /await current\.post;\s*\/\/[^\n]*\n\s*if \(session\.current !== current \|\| ui\.practice\.mode !== 'fsrs'\) return;/);
});

test('the picker: «Додати слова» waits for the catalog, a new or edited deck starts with the default choice', () => {
  assert.match(functionBody(appSource, 'function updateSelectionUi() {'), /decks\.catalogStatus !== 'ready'/);
  assert.match(functionBody(appSource, 'function openForm() {'), /decks\.catalogStatus !== 'ready'/);
  assert.match(functionBody(appSource, 'function startNewDeck() {'), /resetPickerChoice\(\)/);
  assert.match(functionBody(appSource, 'async function editDeck(id) {'), /resetPickerChoice\(\)/);
  assert.match(functionBody(appSource, 'function resetPickerChoice() {'), /query = ''[\s\S]*filter = 'all'[\s\S]*sort = 'alpha'/);
  // The rows are updated in place: a reload does not rebuild the list, and only misplaced rows move.
  assert.doesNotMatch(functionBody(appSource, 'function buildCatalog(words) {'), /replaceChildren/);
  assert.doesNotMatch(functionBody(appSource, 'function renderDeckForm() {'), /formatDeckWordCount\(decks\.selected\.size\)/);
});

test('the decks list refreshes on decks, words and all changes, and an empty deck says so', () => {
  const body = functionBody(appSource, 'function refreshDecksLive(collection) {');
  assert.match(body, /\['decks', 'words', 'all'\]\.includes\(collection\)\) loadDeckList/);
  assert.match(appSource, /Колода порожня/);
  assert.match(functionBody(appSource, 'function syncDeckButtons() {'), /!deck\?\.word_count/);
});

test('the decks section of app.js uses textContent only and reads or writes decks, never grades', () => {
  const start = appSource.indexOf('// ---------- 7 · Колоди ----------');
  const end = appSource.indexOf('// ---------- start ----------');
  assert.ok(start > 0 && end > start, 'section 7 is found before start');
  const section = appSource.slice(start, end);
  assert.doesNotMatch(section, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  const calls = [...new Set([...section.matchAll(/\bapi\.(\w+)/g)].map(match => match[1]))].sort();
  assert.deepEqual(calls, ['createDeck', 'deleteDeck', 'getDeck', 'getDeckWordCatalog', 'getDrillWords', 'listDecks', 'updateDeck']);
  assert.doesNotMatch(section, /recordResult|gradePracticeWord|gradePracticePhrase|postFsrsGrade|postPhraseGrade/);
});

test('every decks element id used by app.js exists in index.html, and the drawer links to the tab', () => {
  const html = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
  const start = appSource.indexOf('// ---------- 7 · Колоди ----------');
  const end = appSource.indexOf('// ---------- start ----------');
  const used = new Set([...appSource.slice(start, end).matchAll(/\$\('(decks-[\w-]+)'\)/g)].map(match => match[1]));
  assert.ok(used.size > 15, 'the section uses many ids');
  for (const id of used) assert.match(html, new RegExp(`id="${id}"`), `index.html has #${id}`);
  assert.match(html, /<section id="tab-decks" class="tab" data-tab="decks"/);
  assert.match(html, /class="drawer__link" data-tab="decks">Колоди</);
});

test('api.js exports the deck calls with the REST paths of §2.2–2.3', () => {
  const apiSource = fs.readFileSync(path.join(here, '..', 'public', 'api.js'), 'utf8');
  for (const [name, route] of [['listDecks', "'/api/decks'"], ['createDeck', "'/api/decks'"], ['getDeckWordCatalog', "'/api/decks/word-catalog'"],
    ['getDeck', '/api/decks/${enc(id)}'], ['updateDeck', '/api/decks/${enc(id)}'], ['deleteDeck', '/api/decks/${enc(id)}']]) {
    assert.match(apiSource, new RegExp(`export const ${name} = `), `${name} is exported`);
    assert.ok(apiSource.includes(route), `${name} uses ${route}`);
  }
});
