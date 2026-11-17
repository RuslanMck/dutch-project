// Словник (docs/WORD_PRIORITY_AND_DICTIONARY.md §3): the pure helpers of the page in logic.js (filters, chips, the
// suggestion line, the add and edit bodies), the client copy of the categories, the api.js calls, and the markup and
// wiring of the page in index.html and app.js. No browser and no network: the page's text is read from its sources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { WORD_CATEGORIES as SERVER_CATEGORIES } from '../src/contracts/category-contracts.js';
import {
  DICTIONARY_FILTERS,
  PRIORITY_TAG_CHOICES,
  TAB_SUBTITLES,
  TAB_TITLES,
  WORD_CATEGORIES,
  buildDictionaryEntry,
  buildNewWordBody,
  buildSuggestionWordBody,
  buildWordChips,
  buildWordDetailView,
  buildWordEditPatch,
  categoryName,
  formatAddedWords,
  formatSuggestionLine,
  matchesDictionaryFilter,
  foldSearchText,
} from '../public/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicFile = name => fs.readFileSync(path.join(here, '..', 'public', name), 'utf8');
const html = publicFile('index.html');
const appSource = publicFile('app.js');
const apiSource = publicFile('api.js');

// The source of one top-level function of app.js: from its first line up to the closing brace at column 0.
function functionSource(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `${header} exists`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 3);
}

const WORDS = [
  { id: 1, nl: 'huis', uk: 'будинок', article: 'het', status: 'learned', priority_tag: null, category: 'home', added_at: 1,
    next_due_on: '2026-11-18' },
  { id: 2, nl: 'fiets', uk: 'велосипед', article: 'de', status: 'new', priority_tag: 'first', category: 'city', added_at: 2 },
  { id: 3, nl: 'lezen', uk: 'читати', article: '', status: 'learning', priority_tag: 'later', category: null, added_at: 3 },
  { id: 4, nl: 'café', uk: 'кафе', article: 'het', status: 'new', priority_tag: null, category: 'food', added_at: 4 },
];
const matching = (criteria, words = WORDS) => words
  .filter(word => matchesDictionaryFilter(buildDictionaryEntry(word), {
    ...criteria,
    query: foldSearchText(criteria.query ?? ''),
  }))
  .map(word => word.id);

test('the client categories have the ids, names and order of the server contract', () => {
  assert.deepEqual(WORD_CATEGORIES.map(({ id, name }) => ({ id, name })),
    SERVER_CATEGORIES.map(({ id, name }) => ({ id, name })));
  assert.equal(categoryName('city'), 'Місто й транспорт');
  assert.equal(categoryName(null), '');
  assert.equal(categoryName('unknown'), '');
});

test('the filter chips and the priority choices are the plan’s, in its order', () => {
  assert.deepEqual(DICTIONARY_FILTERS, ['all', 'new', 'learning', 'learned', 'first', 'later']);
  assert.deepEqual(PRIORITY_TAG_CHOICES.map(choice => [choice.label, choice.tag]),
    [['Авто', null], ['Вчити першим', 'first'], ['Пізніше', 'later']]);
});

test('the filters combine: the search (Dutch or Ukrainian, accents ignored), the status or tag chip, the category', () => {
  assert.deepEqual(matching({ filter: 'all' }), [1, 2, 3, 4]);
  assert.deepEqual(matching({ query: 'CAFE' }), [4]);          // café matches a search without the accent
  assert.deepEqual(matching({ query: 'велос' }), [2]);          // Ukrainian translation
  assert.deepEqual(matching({ filter: 'new' }), [2, 4]);
  assert.deepEqual(matching({ filter: 'learning' }), [3]);
  assert.deepEqual(matching({ filter: 'learned' }), [1]);
  assert.deepEqual(matching({ filter: 'first' }), [2]);
  assert.deepEqual(matching({ filter: 'later' }), [3]);
  assert.deepEqual(matching({ filter: 'new', category: 'food' }), [4]);
  assert.deepEqual(matching({ category: 'home', query: 'huis' }), [1]);
  assert.deepEqual(matching({ query: 'huis', filter: 'later' }), []);
});

test('buildWordChips: category, status, priority tag, next review, in that order, empty ones left out', () => {
  assert.deepEqual(buildWordChips(WORDS[0]), [
    { tone: 'category', text: 'Дім і побут' },
    { tone: 'learned', text: 'вивчене' },
    { tone: 'due', text: 'повтор 18.11' },
  ]);
  assert.deepEqual(buildWordChips(WORDS[1]), [
    { tone: 'category', text: 'Місто й транспорт' },
    { tone: 'new', text: 'нове' },
    { tone: 'first', text: '★ першим' },
  ]);
  assert.deepEqual(buildWordChips(WORDS[2]), [{ tone: 'learning', text: 'вчу' }, { tone: 'later', text: 'пізніше' }]);
  assert.deepEqual(buildWordChips({ status: 'new', priority_tag: null }), [{ tone: 'new', text: 'нове' }]);
});

test('formatSuggestionLine: "de fiets — велосипед · Місто й транспорт", the category left out when there is none', () => {
  assert.equal(formatSuggestionLine({ article: 'de', nl: 'fiets', uk: 'велосипед', category: 'city' }),
    'de fiets — велосипед · Місто й транспорт');
  assert.equal(formatSuggestionLine({ article: '', nl: 'lopen', uk: 'ходити', category: null }), 'lopen — ходити');
});

test('buildSuggestionWordBody keeps the category; formatAddedWords pluralises «слово»', () => {
  assert.deepEqual(buildSuggestionWordBody({ nl: 'fiets', uk: 'велосипед', article: 'de', category: 'city' }),
    { nl: 'fiets', uk: 'велосипед', article: 'de', category: 'city' });
  assert.deepEqual(buildSuggestionWordBody({ nl: 'lopen', uk: 'ходити', article: null, category: null }),
    { nl: 'lopen', uk: 'ходити', article: '' });
  assert.equal(formatAddedWords(1), 'Додано 1 слово');
  assert.equal(formatAddedWords(3), 'Додано 3 слова');
  assert.equal(formatAddedWords(5), 'Додано 5 слів');
  assert.equal(formatAddedWords(21), 'Додано 21 слово');
});

test('buildNewWordBody: trimmed texts, the category when chosen, the priority tag for the call after the add', () => {
  const values = { nl: ' huis ', uk: 'будинок', article: 'het', category: 'home', section: ' 6.1 ', example_nl: '',
    example_uk: 'Це мій дім.', priority: 'first' };
  assert.deepEqual(buildNewWordBody(values), {
    body: { nl: 'huis', uk: 'будинок', article: 'het', category: 'home', section: '6.1', example_uk: 'Це мій дім.' },
    priorityTag: 'first',
  });
  assert.deepEqual(buildNewWordBody({ nl: 'lezen', uk: 'читати', priority: 'auto' }),
    { body: { nl: 'lezen', uk: 'читати', article: '' }, priorityTag: null });
  assert.deepEqual(buildNewWordBody({ nl: '', uk: 'читати' }), { error: 'nl' });
  assert.deepEqual(buildNewWordBody({ nl: 'lezen', uk: '  ' }), { error: 'uk' });
});

test('buildWordEditPatch sends Тема only when it changed; «—» clears it with null', () => {
  const word = { nl: 'huis', uk: 'будинок', article: 'het', section: '', example_nl: '', example_uk: '', category: 'home' };
  const values = { nl: 'huis', uk: 'будинок', article: 'het', section: '', example_nl: '', example_uk: '', category: 'home' };
  assert.deepEqual(buildWordEditPatch(word, values), { patch: {} });
  assert.deepEqual(buildWordEditPatch(word, { ...values, category: 'city' }), { patch: { category: 'city' } });
  assert.deepEqual(buildWordEditPatch(word, { ...values, category: '' }), { patch: { category: null } });
  assert.deepEqual(buildWordEditPatch({ ...word, category: null }, { ...values, category: '' }), { patch: {} });
});

test('the word sheet shows the category as Тема, and the old free-text topic only when there is no category', () => {
  const detail = view => view.details.find(([label]) => label === 'Тема');
  assert.deepEqual(detail(buildWordDetailView({ ...WORDS[0], topic: 'У кафе' })), ['Тема', 'Дім і побут']);
  assert.deepEqual(detail(buildWordDetailView({ ...WORDS[2], topic: 'У кафе' })), ['Тема', 'У кафе']);
  assert.equal(detail(buildWordDetailView(WORDS[2])), undefined);
});

test('the tab is Словник with the plan’s subtitle', () => {
  assert.equal(TAB_TITLES.table, 'Словник');
  assert.equal(TAB_SUBTITLES.table, 'Усі твої слова');
});

test('api.js: setWordPriorityTag is PUT /api/words/:id/priority, getWordSuggestions is POST /api/words/suggestions', () => {
  assert.match(apiSource, /export const setWordPriorityTag = \(id, tag\) => request\('PUT', `\/api\/words\/\$\{enc\(id\)\}\/priority`, \{ tag \}\)/);
  assert.match(apiSource, /export const getWordSuggestions = \(limit = 30\) => request\('POST', '\/api\/words\/suggestions', \{ limit \}\)/);
});

test('the page: the tab, the bottom bar and the section tabs name Словник; the old table form and topic select are gone', () => {
  assert.match(html, /<section id="tab-table" class="tab" data-tab="table" hidden>/);
  assert.match(html, /<button class="bottom-nav__item" type="button" data-tab="table" data-nav="dictionary">/);
  assert.match(html, /<span>Словник<\/span><\/button>/);
  assert.match(html, /<button type="button" data-tab="table">Слова<\/button>/);
  assert.doesNotMatch(html, /id="table-topic"|id="words-body"|>Слова<\/span><\/button>/);
  assert.doesNotMatch(appSource, /table-topic|words-body|wdel/);
});

test('the page: add sheet, the list, filter chips, category select and suggestions carry the plan’s Ukrainian texts', () => {
  for (const text of ['Додати слово', 'Пошук', 'Усі', 'Нові', 'Вчу', 'Вивчені', 'Вчити першим', 'Пізніше', 'усі теми',
    'Слово', 'Переклад', 'Артикль', 'Тема', 'Глава', 'Приклад NL', 'Приклад UK', 'Пріоритет', 'Авто', 'Додати',
    'Скасувати', 'Змінити', 'Видалити', 'Закрити', 'Часті слова, яких бракує',
    'Поширені нідерландські слова, яких ще немає у словнику.', 'Підказати слова', 'Шукаю слова…',
    'Додати вибрані', 'Зберегти']) {
    assert.ok(html.includes(text) || appSource.includes(text), `the page has «${text}»`);
  }
  assert.match(html, /<dialog id="word-add-sheet"[\s\S]*?<form id="word-form"/);
  assert.match(html, /<dialog id="word-sheet"[\s\S]*?id="word-sheet-priority"[\s\S]*?<\/dialog>/);
  assert.match(html, /<button id="word-sheet-delete-button"[^>]*>Видалити<\/button>/);
  assert.match(html, /<select name="category"[\s\S]*?<\/select>[\s\S]*?<span>Тема<\/span>/);
});

test('the page: Головна has no search any more (Словник keeps its own); the list is one row per word, rendered once per data change', () => {
  assert.doesNotMatch(appSource, /handleHomeSearch/);
  assert.match(html, /id="table-q"/);
  const build = functionSource(appSource, 'function buildDictionaryRows() {');
  assert.match(build, /sort\(\(a, b\) => b\.added_at - a\.added_at\)/, 'newest first');
  assert.match(build, /<li class="dict-row">/);
  const filter = functionSource(appSource, 'function renderTable() {');
  assert.match(filter, /if \(dictionary\.words !== state\.words\) buildDictionaryRows\(\);/);
  assert.match(filter, /row\.hidden = hide|row\.hidden !== hide/, 'a filter only toggles hidden');
  assert.doesNotMatch(filter, /innerHTML/, 'a filter never rebuilds the rows');
});

test('the page: the sheet saves the priority at once, the add sheet posts the word then its tag, suggestions go in one bulk add', () => {
  const sheet = functionSource(appSource, 'async function handleSheetPriorityClick(event) {');
  assert.match(sheet, /api\.setWordPriorityTag\(word\.id, choice\.tag\)/);
  const add = functionSource(appSource, 'async function handleWordAdd(event) {');
  assert.match(add, /api\.addWord\(body\)/);
  assert.match(add, /api\.setWordPriorityTag\(created\.id, priorityTag\)/);
  // The form is cleared once the word is saved, before the tag: «Додати» never makes a second copy.
  assert.ok(add.indexOf('form.reset()') < add.indexOf('setWordPriorityTag'));
  const suggest = functionSource(appSource, 'async function handleSuggestionAdd(event) {');
  assert.match(suggest, /api\.addWords\(chosen\.map\(buildSuggestionWordBody\)\)/);
});

test('the page: «Видалити» in the sheet asks first, with the existing dialog', () => {
  const remove = functionSource(appSource, 'function handleSheetDelete() {');
  assert.match(remove, /askDeleteWord\(word, \(\) => \{\s*deleteWordEverywhere\(word\.id\);/);
});

test('the page: the suggestions use the existing add call (no bulk add in api.js) and the growing pot', () => {
  assert.doesNotMatch(apiSource, /suggestions.*bulk|bulk.*add/i);
  assert.match(appSource, /makeGrowingPot\(\)/);
  assert.match(functionSource(appSource, 'async function loadWordSuggestions() {'), /api\.getWordSuggestions\(30\)/);
});

test('the list text escapes every word: rows are built with esc', () => {
  const build = functionSource(appSource, 'function buildDictionaryRows() {');
  assert.match(build, /esc\(word\.nl\)/);
  assert.match(build, /esc\(word\.uk\)/);
  assert.match(build, /esc\(chip\.text\)/);
});

test('every element id that app.js reads exists in index.html', () => {
  const used = new Set([...appSource.matchAll(/\$\('([\w-]+)'\)/g)].map(match => match[1]));
  assert.ok(used.size > 50, 'the app reads many ids');
  for (const id of used) assert.ok(html.includes(`id="${id}"`), `index.html has #${id}`);
});
