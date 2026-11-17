import readme from './README.md?raw';

export default {
  title: 'Components/Study/KnownCheck',
  parameters: { docs: { description: { component: readme } } },
};

// A word chip: the Dutch word with its article and the Ukrainian meaning. A tap marks it as known («✓» by CSS).
const chip = (text, pressed = false) => `<button class="known-check__chip" type="button" aria-pressed="${pressed}">${text}</button>`;

const WORDS = [
  chip('de fiets · велосипед', true),
  chip('werken · працювати', true),
  chip('het boek · книжка'),
  chip('lopen · ходити'),
  chip('de overeenkomst · угода, договір, контракт на спільне виконання робіт', false),
  chip('koken · готувати'),
];

const page = ({ chips = WORDS, message = 'Познач слова, які вже знаєш.', actions = true, result = null } = {}) => `
<p class="hint known-check__note">Познач слова, які ти вже знаєш. Вони не прийдуть як нові, а одразу підуть на повторення через 2–4 тижні.</p>
<p class="muted" role="status" aria-live="polite">${message}</p>
<div class="known-check__chips">${chips.join('')}</div>
${actions ? `<div class="known-check__actions">
  <button class="ghost" type="button">Знаю всі</button>
  <button class="primary" type="button">Готово</button>
</div>` : ''}
${result ? `<div class="known-check__result">
  <p class="known-check__line" role="status">${result.line}</p>
  ${result.nextLabel ? `<button class="primary" type="button">${result.nextLabel}</button>` : ''}
  ${result.endLine ? `<p class="muted">${result.endLine}</p>` : ''}
</div>` : ''}`;

// The batch of new words: two are marked as known, the rest will be learned as new.
export const Overview = {
  render: () => `<div style="max-width:520px">${page()}</div>`,
};

// Nothing is marked yet: every chip is unpressed and «Знаю всі» is the way to mark the whole batch.
export const NothingMarked = {
  render: () => `<div style="max-width:520px">${page({ chips: WORDS.map(c => c.replace('aria-pressed="true"', 'aria-pressed="false"')) })}</div>`,
};

// After «Готово»: the count of known words, and the next batch is one tap away.
export const Result = {
  render: () => `<div style="max-width:520px">${page({
    chips: [],
    actions: false,
    message: '',
    result: { line: 'Позначено як знайомі: 2. Ці слова прийдуть на повторення пізніше.', nextLabel: 'Далі (ще 5)' },
  })}</div>`,
};

// The last batch: no more new words, so the end line replaces the next button.
export const Finished = {
  render: () => `<div style="max-width:520px">${page({
    chips: [],
    actions: false,
    message: '',
    result: { line: 'Позначено як знайомі: 4. Ці слова прийдуть на повторення пізніше.', endLine: 'Нових слів більше немає' },
  })}</div>`,
};
