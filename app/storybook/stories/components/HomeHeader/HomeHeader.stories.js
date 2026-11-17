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
        <svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/></svg>
        <input id="home-search-input" type="search" placeholder="Пошук слова…" autocomplete="off" autocapitalize="none"
          spellcheck="false">
      </form>
</div>
`,
};
