import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/ExerciseBar',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col story-exercise">
  <header id="exercise-bar" class="exercise-bar">
      <button id="exercise-close" class="icon-button" type="button" aria-label="Закрити вправу"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <h1 id="exercise-title" class="exercise-bar__title" tabindex="-1">Нові слова</h1>
    </header>
</div>
`,
};

export const LongTitle = {
  render: () => `
<div class="col story-exercise">
  <header id="exercise-bar" class="exercise-bar">
      <button id="exercise-close" class="icon-button" type="button" aria-label="Закрити вправу"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <h1 id="exercise-title" class="exercise-bar__title" tabindex="-1">Вправи з правил: граматика в реченнях</h1>
    </header>
</div>
`,
};

