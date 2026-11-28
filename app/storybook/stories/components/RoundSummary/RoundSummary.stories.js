import readme from './README.md?raw';

export default {
  title: 'Components/Study/RoundSummary',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<section class="practice-summary col">
<h2 class="practice-round__title">Набір завершено</h2>
<ul class="practice-summary__list"><li class="practice-summary__item">Правильно з першого разу: 7 з 10</li><li class="practice-summary__item">Помилок: 4</li></ul>
<p class="practice-round__hardest">Найважче: de fiets</p>
<ul class="practice-round__words"><li class="practice-round__word"><span>de fiets — велосипед</span><span class="difficulty-badge difficulty-badge--hard">важке</span></li><li class="practice-round__word"><span>werken — працювати</span><span class="difficulty-badge difficulty-badge--easy">легке</span></li></ul>
<div class="practice-round__drills"><button class="primary practice-summary__extra-button">Наступний набір</button></div>
</section>
`,
};

// The end of one set of a deck practised in sets: «Наступні 10» is the main action, «Ще раз» repeats the set.
export const DeckSetEnd = {
  render: () => `
<section class="practice-summary" aria-label="Підсумок тренування">
<p class="practice-summary__text" role="status">Готово! Правильно з першого разу: UA → NL 7 з 10 · NL → UA 8 з 10.</p>
<p class="muted">Тренування — розклад слів не змінюється.</p>
<button class="primary practice-summary__struggling-button" type="button">Наступні 10 · набір 2 з 6</button>
<button class="practice-summary__struggling-button" type="button">Ще раз</button>
<button class="practice-summary__extra-button" type="button">Назад</button>
</section>
`,
};
