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
  canOfferExtraNewWords,
  formatShortDate,
  advanceDrillQueue,
  advanceWindowedQueue,
  formatQueueProgress,
  shuffle,
  formatStrugglingDrillButton,
  buildStrugglingDrillEnd,
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

test('canOfferExtraNewWords: only while the gate is open and New words remain today', () => {
  assert.equal(canOfferExtraNewWords({ newWordsBlocked: false, newRemainingByPriority: { 1: 0, 2: 2, 3: 0 } }), true);
  assert.equal(canOfferExtraNewWords({ newWordsBlocked: false, newRemainingByPriority: { 1: 0, 2: 0, 3: 0 } }), false);
  assert.equal(canOfferExtraNewWords({ newWordsBlocked: true, newRemainingByPriority: { 1: 4, 2: 0, 3: 0 } }), false);
  assert.equal(canOfferExtraNewWords({ newWordsBlocked: false, newRemainingByPriority: {} }), false);
  assert.equal(canOfferExtraNewWords({ newWordsBlocked: undefined, newRemainingByPriority: undefined }), false);
});

test('the deck line says the right answers still needed, a word learned just now, or a review answered right', async () => {
  const { buildDeckLine } = await import('../public/logic.js');
  const inDeck = { in_deck: true, required_correct: 4, correct_count: 1, times_left: 3, has_learned: false };
  assert.equal(buildDeckLine({ deck: inDeck, intervalDays: 1 }), 'Повторень до вивчення: 3');
  const learned = { in_deck: false, required_correct: null, correct_count: 0, times_left: 0, has_learned: true };
  assert.match(buildDeckLine({ deck: learned, intervalDays: 6 }), /^Вивчено ✓ — наступне повторення: /);
  const outside = { in_deck: false, required_correct: null, correct_count: 0, times_left: 0, has_learned: false };
  assert.match(buildDeckLine({ deck: outside, intervalDays: 30 }), /^Повторено ✓ — наступне повторення: /);
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
