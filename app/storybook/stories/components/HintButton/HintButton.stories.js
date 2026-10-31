import readme from './README.md?raw';

export default {
  title: 'Components/Actions/HintButton',
  parameters: { docs: { description: { component: readme } } },
};

const field = isOpen => `
<div class="hint-field col">
  <div class="hint-label">
    <label for="story-mode-${isOpen}">Режим</label>
    <button class="icon-button icon-button--compact" type="button" aria-expanded="${isOpen}" aria-controls="story-hint-${isOpen}"
      aria-label="Пояснення до режиму"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg></button>
  </div>
  <select id="story-mode-${isOpen}"><option>Переклад (FSRS)</option></select>
  <p id="story-hint-${isOpen}" class="hint"${isOpen ? '' : ' hidden'}>"Артикль" — це тренування, яке нічого не змінює.</p>
</div>
`;

export const Overview = { render: () => `<div class="r" style="align-items:flex-start">${field(false)}${field(true)}</div>` };
export const Closed = { render: () => field(false) };
export const Open = { render: () => field(true) };
