// The page side of the two practices (docs/NEW_AND_REVIEW_PRACTICE.md §2): the mode select, the home tiles, the kind
// of each request, the snapshots per kind and the finished screens. No browser: the wiring is read from the sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(here, '..', 'public', name), 'utf8');
const html = read('index.html');
const appSource = read('app.js');
const apiSource = read('api.js');
const logicSource = read('logic.js');

// The body of a top-level function in app.js: from its signature to the closing brace at column 0.
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} is found`);
  return source.slice(start, source.indexOf('\n}\n', start));
}

test('the mode select: Нові слова, then Запам\'ятовування, then Артикль and Важкі слова', () => {
  const select = html.match(/<select id="practice-mode">([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([\w]+)"[^>]*>([^<]+)<\/option>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(options.slice(0, 4), [
    ['fsrs', 'Нові слова'],
    ['review', 'Запам\'ятовування'],
    ['art', 'Артикль'],
    ['struggling', 'Важкі слова'],
  ]);
  assert.match(html, /<p id="practice-kind-line" class="muted practice-kind-line" hidden><\/p>/);
});

test('the home tiles: Нові слова replaces Картки, Запам\'ятовування opens its mode', () => {
  assert.doesNotMatch(html, /home-tile-cards|<button[^>]*data-tab="cards"/);
  assert.match(html, /<button id="home-tile-new" class="practice-tile practice-tile--cards" type="button">[\s\S]*?<span class="practice-tile__name">Нові слова<\/span>\s*<span id="home-tile-new-line"/);
  assert.match(html, /<button id="home-tile-review" class="practice-tile practice-tile--review" type="button">[\s\S]*?<span class="practice-tile__name">Запам'ятовування<\/span>\s*<span id="home-tile-review-line"/);
  assert.ok(html.indexOf('id="home-tile-new"') < html.indexOf('id="home-tile-review"'), 'the review tile comes after the new-words tile');
  assert.match(appSource, /\$\('home-tile-new'\)\.addEventListener\('click', \(\) => openFsrsPractice\('fsrs'\)\);/);
  assert.match(appSource, /\$\('home-tile-review'\)\.addEventListener\('click', \(\) => openFsrsPractice\('review'\)\);/);
  assert.match(functionBody(appSource, 'function openFsrsPractice(mode) {'), /ui\.practice\.mode = mode;[\s\S]*showTab\('practice'\)/);
  assert.match(fs.readFileSync(path.join(here, '..', 'storybook', 'styles', 'garden.css'), 'utf8'),
    /\.practice-tile--review \{ background: var\(--garden-line\); \}/);
});

test('the finished screens: Нові слова has «Ще 10 нових», «Повторити ці слова» and «Завершити»; the drill words are the set', () => {
  assert.match(html, /<button id="practice-round-repeat-button" class="practice-summary__extra-button" type="button" hidden>Повторити ці слова<\/button>/);
  assert.match(html, /<button id="practice-round-next-button"[^>]*>Ще 10 нових<\/button>/);
  assert.match(html, /<button id="practice-round-finish-button"[^>]*>Завершити<\/button>/);
  assert.match(html, /<button id="practice-done-action-button"[^>]*hidden><\/button>/);
  assert.match(html, /<p id="practice-done-note" class="muted practice-done-note" hidden><\/p>/);
  assert.match(appSource, /\$\('practice-done-action-button'\)\.addEventListener\('click', event => choosePracticeMode\(event\.currentTarget\.dataset\.mode\)\);/);
  assert.match(functionBody(appSource, 'async function handleRoundDrillClick(kind) {'), /api\.getDrillWords\(button\.wordIds\)/);
  assert.match(functionBody(appSource, 'async function handleRoundDrillClick(kind) {'), /startCustomDrill\(\{ title: button\.title, words, returnTo: 'round-summary' \}\)/);
  assert.match(functionBody(appSource, 'function roundSetWords(round) {'), /round\.isLocal \? round\.allWords : round\.words/);
  assert.match(functionBody(appSource, 'function renderRoundDrillButtons(round) {'), /repeatButton\.hidden = repeat\.hidden \|\| ui\.fsrs\.kind !== 'new';/);
});

test('every request names its kind: the batch, the spare words and the round summary', () => {
  assert.match(apiSource, /\/api\/practice\/batch\?session_id=\$\{enc\(sessionId\)\}&kind=\$\{enc\(kind\)\}/);
  assert.match(apiSource, /getPracticeBatch = \(sessionId, \{ allowOfflineCache = false, kind = 'new' \} = \{\}\)/);
  assert.match(apiSource, /\/api\/practice\/spare-words\?session_id=\$\{enc\(sessionId\)\}&kind=\$\{enc\(kind\)\}/);
  assert.match(apiSource, /getSpareWords = \(sessionId, kind = 'new'\)/);
  assert.match(apiSource, /\/api\/practice\/round-summary\?kind=\$\{enc\(kind\)\}/);
  assert.match(apiSource, /getRoundSummary = \(kind = 'new'\)/);
  assert.match(functionBody(appSource, 'async function fetchLiveBatch(sessionId, kind) {'), /api\.getPracticeBatch\(sessionId, \{ kind \}\)/);
  assert.match(functionBody(appSource, 'async function showRoundSummaryOrRefill() {'), /api\.getRoundSummary\(kind\)/);
  assert.match(functionBody(appSource, 'async function loadSpareWords(sessionId, kind) {'), /api\.getSpareWords\(sessionId, kind\)/);
});

test('a mode switch loads the batch of the chosen kind, and a stale load does nothing when it arrives', () => {
  assert.match(functionBody(appSource, 'function ensureFsrsSession() {'),
    /if \(ui\.fsrs\.kind !== kind \|\| FSRS_LOAD_STATUSES\.includes\(ui\.fsrs\.status\)\) loadFsrsBatch\(readSessionId\(\), kind\);/);
  const load = functionBody(appSource, 'async function loadFsrsBatch(sessionId, kind) {');
  assert.match(load, /const loadToken = \{\};/);
  assert.equal((load.match(/if \(session\.loadToken !== loadToken\) return;/g) || []).length, 3, 'after the batch, in the catch, and after the snapshot restore');
  assert.match(functionBody(appSource, 'function choosePracticeMode(mode) {'), /ensureFsrsSession\(\);/);
  assert.match(appSource, /const choice = event\.target\.value === 'custom'[\s\S]*?choosePracticeMode\(choice\);/);
});

test('a finished set refills only for the same session and kind', () => {
  assert.match(functionBody(appSource, 'function isSameFsrsSession(sessionId, kind) {'), /ui\.fsrs\.sessionId === sessionId && ui\.fsrs\.kind === kind/);
  const refill = functionBody(appSource, "async function refillFsrsQueue(continueMessage = '') {");
  assert.ok(refill.includes('fetchLiveBatch(sessionId, kind)'), 'the next set asks for the kind on screen');
  assert.equal((refill.match(/isSameFsrsSession\(sessionId, kind\)/g) || []).length, 3);
});

test('the offline snapshots are per kind; the old practice and spare keys are read once and dropped', () => {
  assert.match(functionBody(appSource, 'function saveFsrsSnapshot() {'), /offlineStore\.saveSnapshot\(practiceSnapshotKey\(session\.kind\)/);
  assert.match(functionBody(appSource, 'async function restoreFsrsFromSnapshot(kind) {'), /offlineStore\.loadSnapshot\(practiceSnapshotKey\(kind\)\)/);
  assert.match(functionBody(appSource, 'async function startOfflineNextSet(continueMessage = \'\') {'), /spareSnapshotKey\(kind\)/);
  assert.match(functionBody(appSource, 'function finishFsrsSession() {'), /deleteSnapshot\(practiceSnapshotKey\(session\.kind\)\)/);
  const legacy = functionBody(appSource, 'async function moveLegacyPracticeSnapshots() {');
  assert.match(legacy, /loadSnapshot\('practice'\)/);
  assert.match(legacy, /saveSnapshot\(practiceSnapshotKey\('new'\), legacy\)/);
  assert.match(legacy, /deleteSnapshot\('practice'\)/);
  assert.match(legacy, /deleteSnapshot\('spare'\)/);
  assert.match(appSource, /bindOfflineSupport\(\);\s*moveLegacyPracticeSnapshots\(\);/);
  // No other code reads the old single key.
  assert.doesNotMatch(appSource.replace(legacy, ''), /Snapshot\('practice'\)|Snapshot\('spare'\)/);
});

test('the Нові слова summary is the only one that offers the repeat; the review summary keeps the next-10 and finish', () => {
  assert.match(logicSource, /export function formatRoundNextLabel\(kind\) \{\s*return kind === 'review' \? 'Ще 10' : 'Ще 10 нових';/);
  assert.match(functionBody(appSource, 'function renderRoundSummary() {'), /formatRoundNextLabel\(ui\.fsrs\.kind\)/);
});

test('the Ukrainian texts of the spec are in the page exactly', () => {
  const texts = [
    'Нових слів більше немає. Усі слова вже в повторенні.',
    'Перейти до запам\'ятовування',
    'На сьогодні все повторено',
    'Наступні слова чекають на завтра: ',
    'Сесію завершено',
    'Повторити ці слова',
    'Ще 10 нових',
    'Ще 10',
    'Сьогодні нових: ',
    'Залишилось на сьогодні: ',
    'Усе повторено',
  ];
  // logic.js writes its apostrophes escaped (\'), the page text has the plain one.
  const pageText = `${html}${logicSource}`.replace(/\\'/g, "'");
  for (const text of texts) assert.ok(pageText.includes(text), `the page has «${text}»`);
});
