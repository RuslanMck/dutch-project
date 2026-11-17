import readme from './README.md?raw';

export default {
  title: 'Components/Forms/GoalForm',
  parameters: { docs: { description: { component: readme } } },
};

const goalForm = ({ value = '10', message = '' } = {}) => `
<section class="stats-card goal-setting" aria-label="Ціль на день">
  <form class="goal-form" novalidate>
    <label class="goal-form__label" for="goal-input-story">Ціль на день</label>
    <div class="goal-form__row">
      <input id="goal-input-story" type="number" inputmode="numeric" min="5" max="500" step="5" required value="${value}">
      <button type="submit" class="primary">Зберегти</button>
    </div>
    <p class="muted goal-form__message" role="status">${message}</p>
  </form>
</section>`;

const chapterForm = () => `
<section class="stats-card goal-setting" aria-label="Поточна глава">
  <form class="goal-form" novalidate>
    <label class="goal-form__label" for="chapter-input-story">Поточна глава</label>
    <div class="goal-form__row">
      <input id="chapter-input-story" type="number" inputmode="numeric" min="1" max="99" step="1" required value="6">
      <button type="submit" class="primary">Зберегти</button>
    </div>
    <p class="hint">Слова поточної і попередньої глави вважаються вдвічі поширенішими. Глава оновлюється сама, коли додаєш слова з новішої глави.</p>
    <p class="muted goal-form__message" role="status"></p>
  </form>
</section>`;

// The two forms of Профіль: the daily goal and the current chapter. Both use the same markup.
export const Overview = {
  render: () => `<div class="col" style="max-width:420px">${goalForm()}${chapterForm()}</div>`,
};

// A number outside the range: the message says the allowed range in full.
export const OutOfRange = {
  render: () => goalForm({ value: '700', message: 'Ціль має бути від 5 до 500 відповідей.' }),
};

export const Chapter = {
  render: () => chapterForm(),
};

export const Playground = {
  args: { value: '10', message: '' },
  render: ({ value, message }) => goalForm({ value, message }),
};
