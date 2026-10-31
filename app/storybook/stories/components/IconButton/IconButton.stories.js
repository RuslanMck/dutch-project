import readme from './README.md?raw';

export default {
  title: 'Components/Actions/IconButton',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="r">
  <button class="icon-button" type="button" aria-label="Відкрити меню"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
  <button class="icon-button" type="button" aria-label="Закрити меню"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  <button class="icon-button shuffle-button" type="button" aria-pressed="true" aria-label="Перемішувати слова"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button>
  <button class="icon-button" type="button" aria-label="Видалити слово"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
  <button class="del" type="button" aria-label="Видалити">×</button>
  <button class="del armed" type="button">Видалити?</button>
</div>
`,
};
