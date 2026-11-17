import readme from './README.md?raw';

export default {
  title: 'Components/Study/PracticeNotes',
  parameters: { docs: { description: { component: readme } } },
};

// The small lines of the practice screen: the example of the word, the kind of set, the schedule and the notes of a
// drill or a finished set.
export const Overview = {
  render: () => `
<div class="col" style="max-width:460px">
  <p class="practice-example"><span class="practice-example__nl">Ik fiets elke dag.</span> <span class="practice-example__uk muted">Я щодня їжджу на велосипеді.</span></p>
  <p class="muted practice-kind-line">Сьогодні нових: 4</p>
  <p class="muted practice-schedule">Наступне повторення: через 3 дні</p>
  <p class="muted practice-custom-note">Тренування — розклад слів не змінюється.</p>
  <p class="muted practice-done-note">Наступні слова чекають на завтра: 6.</p>
</div>
`,
};

// The example sentence under the answer: the Dutch line, then the Ukrainian one in muted text.
export const Example = {
  render: () => `<p class="practice-example" style="max-width:460px"><span class="practice-example__nl">Ik fiets elke dag.</span> <span class="practice-example__uk muted">Я щодня їжджу на велосипеді.</span></p>`,
};

// A long example: the sentence wraps and keeps its line height.
export const LongExample = {
  render: () => `<p class="practice-example" style="max-width:360px"><span class="practice-example__nl">Hij heeft gisteren na het werk lang met zijn oude vrienden in het café gepraat.</span> <span class="practice-example__uk muted">Учора після роботи він довго розмовляв зі своїми старими друзями в кафе.</span></p>`,
};

// The note of a drill (Тренування): the schedule does not change, the words are only practised.
export const DrillNote = {
  render: () => `<p class="muted practice-custom-note" style="max-width:460px">Тренування — розклад слів не змінюється.</p>`,
};

