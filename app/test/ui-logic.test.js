// Tests for the pure UI helpers in public/logic.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, normalise, levenshtein, checkAnswer, renderRuleBody } from '../public/logic.js';

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
