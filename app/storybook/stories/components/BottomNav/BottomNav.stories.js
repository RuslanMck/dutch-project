import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/BottomNav',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="story-static-nav">
  <nav id="bottom-nav" class="bottom-nav" aria-label="Розділи">
    <button class="bottom-nav__item" type="button" data-tab="home" data-nav="home" aria-current="page"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg><span>Головна</span></button>
    <button class="bottom-nav__item" type="button" data-tab="decks" data-nav="decks"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4h12v14H7zM4 7v13h12"/></svg><span>Колоди</span></button>
    <button class="bottom-nav__play" type="button" data-tab="practice" data-nav="practice" aria-label="Практика"><svg class="garden-icon garden-icon--filled" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg></button>
    <button class="bottom-nav__item" type="button" data-tab="stats" data-nav="stats"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 20V10M12 20V4M19 20v-7"/></svg><span>Статистика</span></button>
    <button class="bottom-nav__item" type="button" data-tab="profile" data-nav="profile"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4-6 8-6s7 2 8 6"/></svg><span>Профіль</span></button>
  </nav>
</div>
`,
};
