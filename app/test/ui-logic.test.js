// Tests for the pure UI helpers in public/logic.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  buildStrugglingDrillEnd,
  gradeReverseTranslationAnswer,
  revealReverseTranslationAnswer,
  orderNextRound,
  formatRoundProgress,
  formatRoundStart,
  answerKey,
  splitIntoRounds,
  planNextRound,
  ROUND_DIRECTIONS,
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

test('buildStrugglingDrillEnd: first-try count out of all words, and the schedule note', () => {
  assert.deepEqual(buildStrugglingDrillEnd({ correctFirstTimeCount: 1, totalCount: 3 }), {
    resultText: 'Тренування завершено: правильно з першого разу 1 з 3.',
    noteText: 'Це тренування не змінює розклад слів.',
  });
  assert.equal(buildStrugglingDrillEnd({ correctFirstTimeCount: 0, totalCount: 2 }).resultText,
    'Тренування завершено: правильно з першого разу 0 з 2.');
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
