import readme from './README.md?raw';

export default {
  title: 'Components/Study/RuleQuiz',
  parameters: { docs: { description: { component: readme } } },
};

// The rules picker: one checkbox per grammar rule, with the answers so far.
const rule = ({ code, title, stats, checked }) => `
<li><label class="word-order__rule-option">
  <input type="checkbox" value="${code}"${checked ? ' checked' : ''}>
  <span><span class="rule-quiz__rule-title">${code} · ${title}</span><span class="muted rule-quiz__rule-stats">${stats}</span></span>
</label></li>`;

const RULES = [
  { code: '1.1', title: 'Артиклі de та het', stats: '12 відповідей · правильно 75%', checked: true },
  { code: '3.2', title: 'Порядок слів у підрядному реченні', stats: 'ще не тренувалось', checked: true },
  { code: '4.1', title: 'Заперечення з niet і geen', stats: '2 відповіді · правильно 50%', checked: false },
];

const setup = ({ summary = 'Правила: 2 з 3', rules = RULES, startDisabled = false } = {}) => `
<div class="rule-quiz__setup" style="max-width:460px">
  <details class="word-order__rules" open>
    <summary>${summary}</summary>
    <div class="word-order__rules-panel">
      <div class="word-order__rules-tools">
        <button type="button">Усі</button>
        <button type="button">Жодного</button>
      </div>
      <ul class="word-order__rules-list">${rules.map(rule).join('')}</ul>
    </div>
  </details>
  <p class="muted rule-quiz__note">Кожен набір — нові речення: питання складає ШІ з твоїми словами.</p>
  <button class="primary rule-quiz__start" type="button"${startDisabled ? ' disabled' : ''}>Почати: 10 питань</button>
</div>`;

// The loading block while the new questions are made (see Skeleton for the bones).
const loading = () => `
<div class="rule-quiz__loading" role="status" style="max-width:460px">
  <span class="rule-quiz__loading-pot"></span>
  <p class="rule-quiz__loading-text">Готую нові питання…</p>
  <p class="muted rule-quiz__loading-note">Це може тривати до хвилини.</p>
</div>`;

const RULE_TITLE = '1.1 · Артиклі de та het';

// One question: the progress, the rule, the question, the sentence with a gap, the answer box and «Не знаю».
const gapQuestion = ({ gap = '＿＿＿', gapClass = '', message = '', msgClass = 'msg', explanation = '', translation = '', nextButton = false, skip = true } = {}) => `
<div class="rule-quiz__card" style="max-width:460px">
  <p class="muted rule-quiz__progress">Питання 3 з 10</p>
  <p class="rule-quiz__rule">${RULE_TITLE}</p>
  <p class="rule-quiz__question">Встав пропущене слово.</p>
  <p class="rule-quiz__sentence" lang="nl">Ik zie <span class="rule-quiz__gap${gapClass}">${gap}</span> fiets.</p>
  <form class="rule-quiz__form" autocomplete="off">
    <input class="rule-quiz__input" lang="nl" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="нідерландською" aria-label="Відповідь">
    <button class="primary" type="submit">Перевірити</button>
  </form>
  <p class="${msgClass}" aria-live="polite">${message}</p>
  ${translation ? `<p class="muted rule-quiz__translation">${translation}</p>` : ''}
  ${explanation ? `<p class="rule-quiz__explanation">${explanation}</p>` : ''}
  <div class="rule-quiz__actions">
    ${skip ? '<button type="button">Не знаю</button>' : ''}
    ${nextButton ? '<button class="primary" type="button">Далі</button>' : ''}
  </div>
</div>`;

// The sentence-choice question: two sentences, the right one and the wrong one, shown after an answer.
const optionsQuestion = ({ answered = false } = {}) => `
<div class="rule-quiz__card" style="max-width:460px">
  <p class="muted rule-quiz__progress">Питання 4 з 10</p>
  <p class="rule-quiz__rule">${RULE_TITLE}</p>
  <p class="rule-quiz__question">Вибери правильне речення.</p>
  <div class="rule-quiz__options rule-quiz__options--sentences">
    <button class="rule-quiz__option${answered ? ' rule-quiz__option--right' : ''}" type="button" lang="nl" data-option="Ik zie de fiets."${answered ? ' disabled' : ''}>Ik zie de fiets.</button>
    <button class="rule-quiz__option${answered ? ' rule-quiz__option--wrong' : ''}" type="button" lang="nl" data-option="Ik zie het fiets."${answered ? ' disabled' : ''}>Ik zie het fiets.</button>
  </div>
  <p class="${answered ? 'msg ok' : 'msg'}" aria-live="polite">${answered ? '✓ Правильно' : ''}</p>
  ${answered ? '<p class="rule-quiz__explanation">«fiets» має артикль de, тому правильно «de fiets».</p>' : ''}
  <div class="rule-quiz__actions">
    ${answered ? '<button class="primary" type="button">Далі</button>' : '<button type="button">Не знаю</button>'}
  </div>
</div>`;

// The end of a set: the result, the answers that were wrong, and what to do next.
const summary = () => `
<section class="practice-summary rule-quiz__summary" aria-label="Підсумок" style="max-width:460px">
  <p class="practice-summary__text" role="status">Правильно 7 з 10</p>
  <ul class="rule-quiz__mistakes">
    <li>
      <p class="rule-quiz__mistake-sentence" lang="nl">Ik zie de fiets.</p>
      <p class="muted rule-quiz__mistake-detail">1.1 · твоя відповідь: het — «fiets» має артикль de.</p>
    </li>
    <li>
      <p class="rule-quiz__mistake-sentence" lang="nl">Ik heb geen tijd.</p>
      <p class="muted rule-quiz__mistake-detail">4.1 · не знаю — «geen» стоїть перед іменником.</p>
    </li>
  </ul>
  <button class="primary" type="button">Ще 10 питань</button>
  <button type="button">Інші правила</button>
</section>`;

// Step 1: the rules to practise, all of them open by default.
export const Setup = {
  render: () => setup(),
};

// No rule chosen: the summary says «Правила: жодного» and the start button is off.
export const NoRules = {
  render: () => setup({ summary: 'Правила: жодного', rules: RULES.map(r => ({ ...r, checked: false })), startDisabled: true }),
};

// The questions are being made: the shape is shown by Skeleton's loading block.
export const Loading = {
  render: () => loading(),
};

// A question with a gap, not answered yet.
export const Question = {
  render: () => gapQuestion(),
};

// The gap is filled right: green, the words «✓ Правильно» and the translation.
export const Right = {
  render: () => gapQuestion({
    gap: 'de',
    gapClass: 'rule-quiz__gap--right',
    message: '✓ Правильно',
    msgClass: 'msg ok',
    translation: 'Я бачу велосипед.',
    explanation: '«fiets» має артикль de.',
    nextButton: true,
    skip: false,
  }),
};

// The gap is filled wrong: the right word is named in words, the explanation says why.
export const Wrong = {
  render: () => gapQuestion({
    gap: 'het',
    gapClass: 'rule-quiz__gap--wrong',
    message: '✗ Правильно: de',
    msgClass: 'msg bad',
    translation: 'Я бачу велосипед.',
    explanation: '«fiets» має артикль de.',
    nextButton: true,
    skip: false,
  }),
};

// The sentence-choice form before and after an answer.
export const Options = {
  render: () => optionsQuestion(),
};

export const OptionsAnswered = {
  render: () => optionsQuestion({ answered: true }),
};

// The end of a set with two mistakes.
export const Summary = {
  render: () => summary(),
};

// A failed request: the error is a role=alert line in the screen, the setup stays usable.
export const Failed = {
  render: () => `<div style="max-width:460px">${setup()}<p class="msg bad" role="alert">Не вдалося створити питання. Спробуй ще раз.</p></div>`,
};
