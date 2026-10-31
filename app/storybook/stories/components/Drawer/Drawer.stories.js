import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/Drawer',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div style="position:relative;height:430px;overflow:hidden;border:1px solid var(--garden-line);border-radius:var(--garden-radius)">
<header class="top" style="padding:4px 12px"><button class="icon-button menu-button" style="margin-left:0"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><h1>Практика</h1></header>
<div class="drawer-backdrop" style="position:absolute"></div>
<nav class="drawer" style="position:absolute"><div class="drawer__header"><span class="drawer__brand">Dutch матеріали</span><button class="icon-button"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
<div class="drawer__links"><button class="drawer__link" aria-current="page">Практика</button><button class="drawer__link">Колоди</button><button class="drawer__link">Картки</button><button class="drawer__link">Фрази</button><button class="drawer__link">Порядок слів</button><button class="drawer__link">Таблиця</button></div>
<div class="drawer__footer"><button class="ghost">Вийти</button></div></nav></div>
`,
};
