import readme from './README.md?raw';

export default {
  title: 'Components/Data/DictionaryList',
  parameters: { docs: { description: { component: readme } } },
};

// One word of the dictionary: the Dutch word with its article, the meaning, and the chips of its state.
const row = ({ article = '', nl, uk, chips = [] }) => `
<li class="dict-row">
  <button class="dict-row__button" type="button">
    <span class="dict-row__word">${article ? `<span class="art">${article}</span> ` : ''}${nl}</span>
    <span class="dict-row__translation">${uk}</span>
    ${chips.length ? `<span class="dict-row__chips">${chips.map(([tone, text]) => `<span class="dict-chip dict-chip--${tone}">${text}</span>`).join('')}</span>` : ''}
  </button>
</li>`;

const toolbar = (query = '') => `
<div class="dict-toolbar">
  <input type="search" placeholder="Пошук" aria-label="Пошук у словах" autocomplete="off" autocapitalize="none" spellcheck="false" value="${query}">
  <button class="primary" type="button">Додати слово</button>
</div>`;

// The filter chips: the state of the word, and the priority. The pressed one is `aria-pressed="true"`.
const chips = (items, label) => `
<div class="dict-chips" role="group" aria-label="${label}">
  ${items.map(([text, pressed]) => `<button type="button" aria-pressed="${pressed}">${text}</button>`).join('')}
</div>`;

const filters = (active = 'Усі') => [
  chips([['Усі', active === 'Усі'], ['Нові', active === 'Нові'], ['Вчу', active === 'Вчу'], ['Вивчені', active === 'Вивчені']], 'Фільтр слів'),
  chips([['Вчити першим', false], ['Пізніше', false]], 'Пріоритет слів'),
].join('');

const ROWS = [
  row({ article: 'de', nl: 'fiets', uk: 'велосипед', chips: [['category', 'Транспорт'], ['learning', 'вчу'], ['first', '★ першим']] }),
  row({ nl: 'werken', uk: 'працювати', chips: [['learned', 'вивчене']] }),
  row({ article: 'het', nl: 'boek', uk: 'книжка', chips: [['new', 'нове'], ['later', 'пізніше']] }),
];

// The whole dictionary page top: the search and the add button, the filters, the topic and the list.
export const Overview = {
  render: () => `
<div class="col" style="max-width:560px">
  ${toolbar()}
  ${filters('Вчу')}
  <select class="dict-category" aria-label="Тема"><option value="">усі теми</option><option>Транспорт</option></select>
  <ul class="dict-list" aria-label="Слова">${ROWS.join('')}</ul>
</div>
`,
};

// One word with its state chips: the article, the meaning and the three small tags.
export const Row = {
  render: () => `<ul class="dict-list" style="max-width:560px">${ROWS[0]}</ul>`,
};

// A word with no chips: the row is the word and the meaning only.
export const RowPlain = {
  render: () => `<ul class="dict-list" style="max-width:560px">${row({ nl: 'werken', uk: 'працювати' })}</ul>`,
};

// The filter chips: «Вчу» is on, the priority chips are off.
export const Filters = {
  render: () => `<div style="max-width:560px">${filters('Вчу')}</div>`,
};

// The search has no match: the empty line replaces the list.
export const NoMatch = {
  render: () => `
<div class="col" style="max-width:560px">
  ${toolbar('zzz')}
  ${filters('Усі')}
  <p class="empty">Нічого не знайдено.</p>
  <ul class="dict-list" aria-label="Слова"></ul>
</div>
`,
};

// A long word and a long meaning: the row wraps and the chips move to the next line.
export const LongText = {
  render: () => `<ul class="dict-list" style="max-width:420px">${row({
    article: 'de',
    nl: 'overeenkomst',
    uk: 'угода, договір, контракт на спільне виконання робіт',
    chips: [['category', 'Право і гроші'], ['learning', 'вчу'], ['due', 'повтор 3 груд.']],
  })}</ul>`,
};

// The suggestions card at the bottom of the page: the words the dictionary does not have yet, checked by default.
export const Suggestions = {
  render: () => `
<section class="stats-card dict-suggest" style="max-width:560px" aria-label="Часті слова, яких бракує">
  <h2 class="stats-card__title">Часті слова, яких бракує</h2>
  <p class="muted">Поширені нідерландські слова, яких ще немає у словнику.</p>
  <form class="dict-suggest__form">
    <ul class="deck-catalog" aria-label="Пропоновані слова">
      <li class="deck-row"><label class="deck-row__label"><input class="deck-row__check" type="checkbox" checked><span class="deck-row__text"><span class="deck-row__word">de tuin — садок · Дім і сад</span></span></label></li>
      <li class="deck-row"><label class="deck-row__label"><input class="deck-row__check" type="checkbox" checked><span class="deck-row__text"><span class="deck-row__word">lezen — читати · Навчання</span></span></label></li>
      <li class="deck-row"><label class="deck-row__label"><input class="deck-row__check" type="checkbox"><span class="deck-row__text"><span class="deck-row__word">het weer — погода · Природа</span></span></label></li>
    </ul>
    <div class="sheet__actions sheet__actions--pair">
      <button class="ghost" type="button">Скасувати</button>
      <button class="primary" type="submit">Додати вибрані (2)</button>
    </div>
  </form>
</section>`,
};

// The suggestions while they are looked up: the pot turns and the line says the search is on.
export const SuggestionsLoading = {
  render: () => `
<section class="stats-card dict-suggest" style="max-width:560px" aria-label="Часті слова, яких бракує">
  <h2 class="stats-card__title">Часті слова, яких бракує</h2>
  <div class="dict-suggest__loading" role="status">
    <span class="dict-suggest__pot" aria-hidden="true"></span>
    <p class="muted">Шукаю слова…</p>
  </div>
</section>`,
};
