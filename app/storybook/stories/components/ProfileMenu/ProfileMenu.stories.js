import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/ProfileMenu',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
  <nav class="profile-menu" aria-label="Інші розділи">
          <button class="profile-menu__link" type="button" data-tab="settings"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4"/></svg><span>Налаштування</span></button>
        </nav>
  <form class="profile-logout" method="post" action="/auth/logout">
          <button class="ghost profile-logout__button" type="submit"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/></svg>Вийти</button>
        </form>
</div>
`,
};

