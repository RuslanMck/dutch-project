import readme from './README.md?raw';

export default {
  title: 'Components/Study/PracticeTiles',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
      <div class="practice-tiles">
        <button class="practice-tile practice-tile--cards" type="button" data-tab="cards">
          <span class="practice-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4h12v14H7zM4 7v13h12"/></svg></span>
          <span class="practice-tile__name">Картки</span>
          <span id="home-tile-cards" class="practice-tile__line">601 слово</span>
        </button>
        <button class="practice-tile practice-tile--word-order" type="button" data-tab="word-order">
          <span class="practice-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg></span>
          <span class="practice-tile__name">Порядок слів</span>
          <span id="home-tile-word-order" class="practice-tile__line">Правила: усі</span>
        </button>
        <button class="practice-tile practice-tile--phrases" type="button" data-tab="phrases">
          <span class="practice-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16v11H9l-5 4z"/></svg></span>
          <span class="practice-tile__name">Фрази</span>
          <span id="home-tile-phrases" class="practice-tile__line">27 фраз</span>
        </button>
        <button id="home-tile-struggling-button" class="practice-tile practice-tile--struggling" type="button">
          <span class="practice-tile__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z"/></svg></span>
          <span class="practice-tile__name">Важкі слова</span>
          <span id="home-tile-struggling" class="practice-tile__line">17 слів</span>
        </button>
      </div>
</div>
`,
};
