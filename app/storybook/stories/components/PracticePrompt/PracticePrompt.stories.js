import readme from './README.md?raw';

export default {
  title: 'Components/Study/PracticePrompt',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
<div class="set-progress" role="progressbar" aria-label="Прогрес набору" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30" aria-valuetext="Вивчено 3 з 10, вчимо 4, чекають 3">
<div class="set-progress__bar"><span class="set-progress__learned" style="width:30%"></span><span class="set-progress__learning" style="width:14%"></span></div>
<p class="set-progress__legend" aria-hidden="true"><span class="set-progress__key set-progress__key--learned">Вивчено 3</span><span class="set-progress__key set-progress__key--learning">Вчимо 4</span><span class="set-progress__key set-progress__key--waiting">Чекають 3</span></p>
</div>
<div class="practice-q">велосипед</div>
<form class="row-form" onsubmit="return false"><input value="de fits" aria-label="Відповідь"><button class="primary" type="submit">Перевірити</button></form>
<p class="msg bad">Неправильно: de fiets</p>
<div class="practice-meta"><p class="muted practice-meta__progress">Залишилось: 7 з 10</p>
<button class="icon-button shuffle-button" type="button" aria-pressed="true" aria-label="Перемішувати"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button><button class="icon-button" type="button" aria-expanded="false" aria-label="Пояснення"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg></button></div>
</div>
`,
};
