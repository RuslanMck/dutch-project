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

test('gradeTranslationAnswer: wrong article on a de/het word is hard and shows the right article', () => {
  const r = gradeTranslationAnswer(huis, 'de huis');
  assert.equal(r.counted, true);
  assert.equal(r.grade, 'hard');
  assert.equal(r.message, 'Слово вірно, але артикль інший. Правильно: het huis');
});

test('gradeTranslationAnswer: missing article on a de/het word is hard and shows the right article', () => {
  const r = gradeTranslationAnswer(huis, 'huis');
  assert.equal(r.counted, true);
  assert.equal(r.grade, 'hard');
  assert.equal(r.message, 'Слово вірно, але без артикля. Правильно: het huis');
});

test('gradeTranslationAnswer: extra article on a word without article is hard', () => {
  const r = gradeTranslationAnswer(appel, 'de appel');
  assert.equal(r.grade, 'hard');
  assert.equal(r.message, 'Слово вірно, але артикль зайвий. Правильно: appel');
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
