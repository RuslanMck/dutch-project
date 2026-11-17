import readme from './README.md?raw';

export default {
  title: 'Components/Actions/HintButton',
  parameters: { docs: { description: { component: readme } } },
};

// The hint button of the practice progress line (#practice-progress-hint-button) and the hint it opens.
const ICON = `<svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg>`;

const hintButton = (isOpen, id) => `<button id="${id}" class="icon-button" type="button" aria-expanded="${isOpen}"
  aria-controls="story-hint-${isOpen}" aria-label="Пояснення до залишку" data-hint-button>${ICON}</button>`;

const hintParagraph = isOpen => `<p id="story-hint-${isOpen}" class="hint"${isOpen ? '' : ' hidden'}>Скільки слів набору ще не вивчено. У наборі не більше 10 слів: у «Нових словах» — лише нові слова, у «Запам'ятовуванні» — лише слова, які вже вчили. Одночасно вчимо 5 слів: слово повертається серед них, доки ви не назвете його правильно потрібну кількість разів — її показує рядок «Повторень до вивчення» під відповіддю. Вивчене слово звільняє місце для наступного. Кнопка зі стрілками вмикає й вимикає перемішування.</p>`;

export const Overview = {
  render: () => `<div class="col" style="max-width:460px">
${hintButton(false, 'story-hint-button-closed')}
${hintParagraph(false)}
${hintButton(true, 'story-hint-button-open')}
${hintParagraph(true)}
</div>`,
};

export const Closed = { render: () => `<div class="col" style="max-width:460px">${hintButton(false, 'story-hint-button-closed')}${hintParagraph(false)}</div>` };
export const Open = { render: () => `<div class="col" style="max-width:460px">${hintButton(true, 'story-hint-button-open')}${hintParagraph(true)}</div>` };
