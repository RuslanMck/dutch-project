import readme from './README.md?raw';

export default {
  title: 'Components/Actions/IconButton',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="r">
  <button class="icon-button shuffle-button" type="button" aria-pressed="true" aria-label="Перемішувати слова"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button>
  <button class="icon-button shuffle-button" type="button" aria-pressed="false" aria-label="Перемішувати слова"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button>
  <button class="icon-button" type="button" aria-expanded="false" aria-label="Пояснення до залишку"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg></button>
  <button class="icon-button" type="button" aria-expanded="true" aria-label="Пояснення до залишку"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg></button>
  <button class="icon-button" type="button" aria-label="Видалити слово"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
  <button class="del" type="button" aria-label="Видалити"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  <button class="del armed" type="button">видалити?</button>
</div>
`,
};
