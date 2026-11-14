// Tests for the «Що я вже знаю» page, the Головна and Колоди entries and the Профіль chapter field (plan §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatKnownCheckChip,
  toggleKnownCheckChoice,
  buildKnownCheckPayload,
  buildKnownCheckResult,
  parseChapterInput,
  TAB_TITLES,
  TAB_SUBTITLES,
  NAVIGATION_SECTION_FOR_TAB,
  findNavigationSection,
} from '../public/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(here, '..', 'public', name), 'utf8');
const html = read('index.html');
const appSource = read('app.js');
const apiSource = read('api.js');

test('formatKnownCheckChip: article first, then the Ukrainian translation', () => {
  assert.equal(formatKnownCheckChip({ nl: 'huis', article: 'de', uk: 'будинок' }), 'de huis · будинок');
  assert.equal(formatKnownCheckChip({ nl: 'lezen', article: null, uk: 'читати' }), 'lezen · читати');
});

test('toggleKnownCheckChoice adds and removes one id without changing the list it got', () => {
  const chosen = [3, 5];
  assert.deepEqual(toggleKnownCheckChoice(chosen, 7), [3, 5, 7]);
  assert.deepEqual(toggleKnownCheckChoice(chosen, 3), [5]);
  assert.deepEqual(chosen, [3, 5]);
});

test('buildKnownCheckPayload: chosen words are known, the rest of the batch unknown', () => {
  assert.deepEqual(buildKnownCheckPayload([1, 2, 3, 4], [4, 2]), { known_ids: [2, 4], unknown_ids: [1, 3] });
  assert.deepEqual(buildKnownCheckPayload([1, 2], []), { known_ids: [], unknown_ids: [1, 2] });
  // An id outside the batch is never sent.
  assert.deepEqual(buildKnownCheckPayload([1], [9]), { known_ids: [], unknown_ids: [1] });
});

test('buildKnownCheckResult: the count line and «Далі (ще N)» while new words remain', () => {
  const result = buildKnownCheckResult({ known: 6, remaining: 14 });
  assert.equal(result.line, 'Позначено як знайомі: 6. Ці слова прийдуть на повторення пізніше.');
  assert.equal(result.nextLabel, 'Далі (ще 14)');
  assert.equal(result.endLine, '');
});

test('buildKnownCheckResult: no next batch and the end line when no new words are left', () => {
  const result = buildKnownCheckResult({ known: 0, remaining: 0 });
  assert.equal(result.nextLabel, '');
  assert.equal(result.endLine, 'Нових слів більше немає');
});

test('parseChapterInput accepts integers 1 to 99 only', () => {
  assert.equal(parseChapterInput('1'), 1);
  assert.equal(parseChapterInput('99'), 99);
  assert.equal(parseChapterInput(' 7 '), 7);
  for (const bad of ['', '0', '100', '-3', '2.5', 'abc']) assert.equal(parseChapterInput(bad), null, bad);
});

test('known-check belongs to Головна: title, subtitle and navigation', () => {
  assert.equal(TAB_TITLES['known-check'], 'Що я вже знаю');
  assert.equal(TAB_SUBTITLES['known-check'], 'Швидка перевірка слів');
  assert.equal(findNavigationSection('known-check'), 'home');
  assert.equal(NAVIGATION_SECTION_FOR_TAB['known-check'], 'home');
});

test('the known-check tab is registered in TABS and has its page section', () => {
  assert.match(appSource, /const TABS = \[[^\]]*'known-check'[^\]]*\];/);
  assert.match(html, /<section id="tab-known-check" class="tab" data-tab="known-check" hidden>/);
  for (const id of ['known-check-chips', 'known-check-all', 'known-check-done', 'known-check-result', 'known-check-next']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('Головна has the «Що я вже знаю» and «Артикль» tiles after the existing tiles', () => {
  const weekTile = html.indexOf('practice-tile--week');
  const knownTile = html.indexOf('id="home-tile-known-check"');
  const articleTile = html.indexOf('id="home-tile-article"');
  assert.ok(knownTile > weekTile && articleTile > knownTile);
  assert.match(html, /id="home-tile-known-check"[^>]*data-tab="known-check"/);
  assert.match(html, /Що я вже знаю<\/span>\s*<span class="practice-tile__line">Пропусти знайомі слова/);
  assert.match(html, /Артикль<\/span>\s*<span class="practice-tile__line">de чи het/);
});

test('Практика links to the known check; the article tile and the Колоди card open the art mode', () => {
  assert.match(html, /<button id="practice-known-check-link"[^>]*data-tab="known-check">Перевірити, що я вже знаю<\/button>/);
  assert.match(appSource, /\$\('home-tile-article'\)\.addEventListener\('click', openArticlePractice\)/);
  assert.match(appSource, /function openArticlePractice\(\) \{\s*ui\.practice\.mode = 'art';/);
  assert.match(appSource, /'Артикль: de чи het'/);
});

test('Профіль: the chapter field sits right after the goal form, with its hint', () => {
  const goalForm = html.indexOf('id="goal-form"');
  const chapter = html.indexOf('id="profile-chapter"');
  assert.ok(chapter > goalForm);
  assert.match(html, /<label id="profile-chapter-label" class="goal-form__label" for="chapter-input">Поточна глава<\/label>/);
  assert.match(html, /Слова поточної і попередньої глави рахуються вдвічі поширенішими\. Глава оновлюється сама, коли додаєш слова з новішої глави\./);
});

test('api.js exposes the known-check and chapter calls with the plan shapes', () => {
  assert.match(apiSource, /export const getKnownCheck = [^;]*\/api\/practice\/known-check\?limit=/);
  assert.match(apiSource, /export const postKnownCheck = \(knownIds, unknownIds\) => request\('POST', '\/api\/practice\/known-check', \{ known_ids: knownIds, unknown_ids: unknownIds \}\)/);
  assert.match(apiSource, /export const getChapter = [^;]*\/api\/practice\/chapter'/);
  assert.match(apiSource, /export const saveChapter = chapter => request\('PUT', '\/api\/practice\/chapter', \{ chapter \}\)/);
});
