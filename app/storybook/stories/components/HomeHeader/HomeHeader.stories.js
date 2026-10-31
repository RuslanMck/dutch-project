import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/HomeHeader',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="app" style="padding-bottom:16px">
      <div class="home-header">
        <p id="home-greeting" class="home-header__greeting">Hoi!</p>
        <p class="home-header__subtitle">Що вчимо сьогодні?</p>
      </div>
      <form id="home-search-form" class="home-search" role="search">
        <label class="sr-only" for="home-search-input">Пошук слова</label>
        <svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4"/></svg>
        <input id="home-search-input" type="search" placeholder="Пошук слова…" autocomplete="off" autocapitalize="none"
          spellcheck="false">
      </form>
</div>
`,
};
