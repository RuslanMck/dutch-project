import readme from './README.md?raw';

export default {
  title: 'Components/Study/SetProgress',
  parameters: { docs: { description: { component: readme } } },
};

// The same markup the practice fills (renderPracticeProgressBar in public/app.js).
function setProgress({ learned, learning, waiting, learnedPercent, learningPercent }) {
  const total = learned + learning + waiting;
  const layer = (name, percent) => `<span class="set-progress__${name}"${percent ? '' : ' hidden'} style="width:${percent}%"></span>`;
  return `<div class="set-progress" role="progressbar" aria-label="Прогрес набору" aria-valuemin="0" aria-valuemax="100"
  aria-valuenow="${learnedPercent}" aria-valuetext="Вивчено ${learned} з ${total}, вчимо ${learning}, чекають ${waiting}">
  <div class="set-progress__bar">${layer('learned', learnedPercent)}${layer('learning', learningPercent)}</div>
  <p class="set-progress__legend" aria-hidden="true"><span class="set-progress__key set-progress__key--learned">Вивчено ${learned}</span><span
    class="set-progress__key set-progress__key--learning">Вчимо ${learning}</span><span
    class="set-progress__key set-progress__key--waiting">Чекають ${waiting}</span></p>
</div>`;
}

export const MidSet = {
  name: 'Mid set',
  render: () => `<div class="col">${setProgress({ learned: 3, learning: 4, waiting: 3, learnedPercent: 30, learningPercent: 14 })}</div>`,
};

export const FreshSet = {
  name: 'Fresh set',
  render: () => `<div class="col">${setProgress({ learned: 0, learning: 5, waiting: 5, learnedPercent: 0, learningPercent: 0 })}</div>`,
};

export const RoundTwo = {
  name: 'Round 2',
  render: () => `<div class="col">${setProgress({ learned: 6, learning: 4, waiting: 0, learnedPercent: 60, learningPercent: 25 })}</div>`,
};

export const Playground = {
  args: { learned: 3, learning: 4, waiting: 3, learnedPercent: 30, learningPercent: 14 },
  render: args => `<div class="col">${setProgress(args)}</div>`,
};
