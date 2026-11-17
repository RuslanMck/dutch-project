import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/ProfileMenu',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
      <nav class="profile-menu" aria-label="Інші розділи">
        <button class="profile-menu__link" type="button" data-tab="table"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg><span>Словник</span></button>
        <button class="profile-menu__link" type="button" data-tab="rules"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h9"/></svg><span>Правила</span></button>
        <button class="profile-menu__link" type="button" data-tab="texts"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5h14M5 10h14M5 15h9M5 20h6"/></svg><span>Тексти</span></button>
        <button class="profile-menu__link" type="button" data-tab="settings"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4"/></svg><span>Налаштування</span></button>
      </nav>
      <form class="profile-logout" method="post" action="/auth/logout">
        <button class="ghost" type="submit">Вийти</button>
      </form>
</div>
`,
};
