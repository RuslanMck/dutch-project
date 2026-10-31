import readme from './README.md?raw';

export default {
  title: 'Components/Study/PracticePrompt',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
<div class="practice-q">велосипед</div>
<form class="row-form" onsubmit="return false"><input value="de fits" aria-label="Відповідь"><button class="primary" type="submit">Перевірити</button></form>
<p class="msg bad">Неправильно: de fiets</p>
<div class="practice-meta"><p class="muted practice-meta__progress">Залишилось: 7 з 10</p>
<button class="icon-button shuffle-button" aria-pressed="true" aria-label="Перемішувати"><svg class="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button><button class="hint-button" aria-label="Пояснення">i</button></div>
</div>
`,
};
