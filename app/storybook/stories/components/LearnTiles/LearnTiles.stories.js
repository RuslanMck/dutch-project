import readme from './README.md?raw';

export default {
  title: 'Components/Study/LearnTiles',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
  <h2 class="learn-section-title">Слова</h2>
        <div class="learn-tiles">
          <button id="learn-article" class="learn-tile" type="button">
            <span class="learn-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 12.5L11 5h8.5v8.5L12 21z"/><circle cx="15.5" cy="9" r="1.2"/></svg></span>
            <span class="learn-tile__name">Артикль</span>
            <span class="learn-tile__line">de чи het</span>
          </button>
          <button id="learn-struggling" class="learn-tile" type="button">
            <span class="learn-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 8a3 3 0 0 1 6 0"/><path d="M7 9.5h10l1.5 10.5h-13z"/></svg></span>
            <span class="learn-tile__name">Важкі слова</span>
            <span id="learn-struggling-line" class="learn-tile__line">…</span>
          </button>
          <button class="learn-tile" type="button" data-tab="known-check">
            <span class="learn-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.8-5.4"/></svg></span>
            <span class="learn-tile__name">Що я знаю</span>
            <span class="learn-tile__line">Пропусти знайомі слова</span>
          </button>
        </div>

        <h2 class="learn-section-title">Речення</h2>
        <div class="learn-tiles">
          <button class="learn-tile" type="button" data-tab="word-order">
            <span class="learn-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h9M4 12h9M4 18h6"/><path d="M18 4v15M15 16l3 3 3-3"/></svg></span>
            <span class="learn-tile__name">Порядок слів</span>
            <span class="learn-tile__line">Склади речення</span>
          </button>
          <button class="learn-tile" type="button" data-tab="rule-quiz">
            <span class="learn-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M13 6l5 5"/></svg></span>
            <span class="learn-tile__name">Граматика</span>
            <span class="learn-tile__line">У реченнях</span>
          </button>
          <button class="learn-tile" type="button" data-tab="phrases">
            <span class="learn-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h11v8H9l-5 4z"/><path d="M15 9h5v8l-3-2h-6v-2"/></svg></span>
            <span class="learn-tile__name">Фрази</span>
            <span id="learn-phrases-line" class="learn-tile__line">Фрази з діалогів</span>
          </button>
        </div>
</div>
`,
};

export const Decks = {
  render: () => `
<div class="col">
<div class="learn-section-head">
  <h2 class="learn-section-title">Мої колоди</h2>
  <button class="learn-section-link" type="button" data-tab="decks">Усі</button>
</div>
<div class="learn-decks">
  <button class="learn-deck" type="button">
    <span class="learn-deck__name">Усі слова</span><span class="muted learn-deck__line">601 слово</span>
  </button>
  <button class="learn-deck" type="button">
    <span class="learn-deck__name">Їжа</span><span class="muted learn-deck__line">12 слів</span>
  </button>
  <button class="learn-deck" type="button" disabled>
    <span class="learn-deck__name">Порожня колода</span><span class="muted learn-deck__line">Немає слів</span>
  </button>
  <button class="learn-deck learn-deck--new" type="button">
    <svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>
    <span class="learn-deck__name">Нова колода</span>
  </button>
</div>
</div>
`,
};
