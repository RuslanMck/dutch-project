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
