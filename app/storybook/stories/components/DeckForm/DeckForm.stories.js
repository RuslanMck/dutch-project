import readme from './README.md?raw';

export default {
  title: 'Components/Forms/DeckForm',
  parameters: { docs: { description: { component: readme } } },
};

// One chosen word in the deck form, with the close icon that removes it.
const CLOSE = '<path d="M6 6l12 12M18 6L6 18"/>';
const word = label => `
<li class="deck-form-word">
  <span class="deck-form-word__text">${label}</span>
  <button class="del" type="button" aria-label="Прибрати слово ${label.split(' — ')[0].replace(/^(de|het) /, '')}"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${CLOSE}</svg></button>
</li>`;

const form = ({ name = '', description = '', words = [], count = '0 слів', saveDisabled = true, message = '' } = {}) => `
<form class="deck-form" autocomplete="off" style="max-width:520px">
  <h2 class="deck-picker__title">Нова колода</h2>
  <label class="field">
    <span>Назва</span>
    <input name="name" required maxlength="80" autocapitalize="sentences" value="${name}">
  </label>
  <label class="field">
    <span>Опис (необов'язково)</span>
    <textarea name="description" maxlength="500" rows="2">${description}</textarea>
  </label>
  <div class="deck-form__words">
    <p class="muted">${count}</p>
    <ul class="deck-form-words">${words.map(word).join('')}</ul>
  </div>
  <p class="msg${message ? ' bad' : ''}" aria-live="polite">${message}</p>
  <div class="deck-form__actions">
    <button type="button">Назад</button>
    <button class="primary" type="submit"${saveDisabled ? ' disabled' : ''}>Створити колоду</button>
  </div>
</form>`;

// A deck with three words: the count names them and «Створити колоду» is on.
export const Overview = {
  render: () => form({
    name: 'Артиклі',
    description: 'Слова для тренування без зміни розкладу.',
    words: ['de fiets — велосипед', 'het boek — книжка', 'de tafel — стіл'],
    count: '3 слова',
    saveDisabled: false,
  }),
};

// A new deck before any word is chosen: the save button is off until one is picked.
export const Empty = {
  render: () => form({ count: '0 слів' }),
};

// The name is missing: the message says what to fill in, in words.
export const NameMissing = {
  render: () => form({
    words: ['werken — працювати'],
    count: '1 слово',
    saveDisabled: false,
    message: 'Дай колоді назву.',
  }),
};

// A long name and words with long meanings: the text wraps inside the form.
export const LongText = {
  render: () => form({
    name: 'Нерегулярні дієслова з приставками, які часто плутаються на іспиті',
    words: ['de overeenkomst — угода, договір, контракт на спільне виконання робіт'],
    count: '1 слово',
    saveDisabled: false,
  }),
};

// The picker that comes before the form: the title, the search, the filter chips, the sort and the bar with the count.
export const Picker = {
  render: () => `
<div class="deck-picker" style="max-width:520px">
  <div class="deck-picker__head">
    <h2 class="deck-picker__title">Обери слова</h2>
    <button type="button">Скасувати</button>
  </div>
  <input type="search" placeholder="Пошук: голландське або українське слово" aria-label="Пошук слів" autocapitalize="none" spellcheck="false" autocomplete="off">
  <div class="deck-chips" role="group" aria-label="Фільтр слів">
    <button type="button" data-filter="all" aria-pressed="true">Усі</button>
    <button type="button" data-filter="hard" aria-pressed="false">Важкі</button>
    <button type="button" data-filter="new" aria-pressed="false">Нові</button>
    <button type="button" data-filter="selected" aria-pressed="false">Обрані</button>
  </div>
  <div class="deck-picker__tools">
    <label class="field">
      <span>Порядок</span>
      <select aria-label="Порядок слів">
        <option value="alpha">за алфавітом</option>
        <option value="hardest">спочатку важкі</option>
        <option value="stale">давно не практиковані</option>
      </select>
    </label>
    <button type="button">Обрати всі видимі</button>
    <button type="button">Зняти всі</button>
  </div>
  <div class="deck-bar">
    <p class="deck-bar__count" role="status">Обрано: 2</p>
    <button class="primary" type="button">Додати слова</button>
  </div>
</div>`,
};
