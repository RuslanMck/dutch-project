import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/BottomNav',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="story-static-nav">
  <nav id="bottom-nav" class="bottom-nav" aria-label="Розділи">
      <button class="bottom-nav__item" type="button" data-tab="home" data-nav="home"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/></svg><span>Головна</span></button>
      <button class="bottom-nav__item" type="button" data-tab="table" data-nav="dictionary"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1h12v-3"/><path d="M9.5 12.5l2-5.5 2 5.5M10.2 10.8h2.6"/></svg><span>Словник</span></button>
      <button class="bottom-nav__hub" type="button" data-tab="learn" data-nav="learn" aria-current="page"><span class="bottom-nav__slot" aria-hidden="true"></span><span class="bottom-nav__disc"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5V20"/></svg></span><span>Вчити</span></button>
      <button class="bottom-nav__item" type="button" data-tab="stats" data-nav="progress"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h16"/><path d="M7 16v-3M12 16V9M17 16V5"/></svg><span>Прогрес</span></button>
      <button class="bottom-nav__item" type="button" data-tab="profile" data-nav="profile"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/></svg><span>Профіль</span></button>
    </nav>
</div>
`,
};

export const OnHome = {
  render: () => `
<div class="story-static-nav">
  <nav id="bottom-nav" class="bottom-nav" aria-label="Розділи">
      <button class="bottom-nav__item" type="button" data-tab="home" data-nav="home" aria-current="page"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/></svg><span>Головна</span></button>
      <button class="bottom-nav__item" type="button" data-tab="table" data-nav="dictionary"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1h12v-3"/><path d="M9.5 12.5l2-5.5 2 5.5M10.2 10.8h2.6"/></svg><span>Словник</span></button>
      <button class="bottom-nav__hub" type="button" data-tab="learn" data-nav="learn"><span class="bottom-nav__slot" aria-hidden="true"></span><span class="bottom-nav__disc"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5V20"/></svg></span><span>Вчити</span></button>
      <button class="bottom-nav__item" type="button" data-tab="stats" data-nav="progress"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h16"/><path d="M7 16v-3M12 16V9M17 16V5"/></svg><span>Прогрес</span></button>
      <button class="bottom-nav__item" type="button" data-tab="profile" data-nav="profile"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/></svg><span>Профіль</span></button>
    </nav>
</div>
`,
};

export const OnDictionary = {
  render: () => `
<div class="story-static-nav">
  <nav id="bottom-nav" class="bottom-nav" aria-label="Розділи">
      <button class="bottom-nav__item" type="button" data-tab="home" data-nav="home"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/></svg><span>Головна</span></button>
      <button class="bottom-nav__item" type="button" data-tab="table" data-nav="dictionary" aria-current="page"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1h12v-3"/><path d="M9.5 12.5l2-5.5 2 5.5M10.2 10.8h2.6"/></svg><span>Словник</span></button>
      <button class="bottom-nav__hub" type="button" data-tab="learn" data-nav="learn"><span class="bottom-nav__slot" aria-hidden="true"></span><span class="bottom-nav__disc"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5V20"/></svg></span><span>Вчити</span></button>
      <button class="bottom-nav__item" type="button" data-tab="stats" data-nav="progress"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h16"/><path d="M7 16v-3M12 16V9M17 16V5"/></svg><span>Прогрес</span></button>
      <button class="bottom-nav__item" type="button" data-tab="profile" data-nav="profile"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/></svg><span>Профіль</span></button>
    </nav>
</div>
`,
};
