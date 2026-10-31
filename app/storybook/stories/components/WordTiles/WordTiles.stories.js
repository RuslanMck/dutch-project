import readme from './README.md?raw';

export default {
  title: 'Components/Study/WordTiles',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
<p class="word-order__uk">Я сьогодні не працюю.</p>
<div class="word-order__answer"><button class="word-tile word-tile--answer">Ik</button><button class="word-tile word-tile--answer">werk</button><button class="word-tile word-tile--answer">vandaag</button></div>
<div class="word-order__pile"><button class="word-tile word-tile--pile">niet</button><button class="word-tile word-tile--pile word-tile--gap">Ik</button><button class="word-tile word-tile--pile">.</button></div>
</div>
`,
};

export const Tile = {
  args: { word: 'werk', place: 'pile', gap: false },
  argTypes: { place: { control: 'inline-radio', options: ['pile', 'answer'] } },
  render: ({ word, place, gap }) =>
    `<button class="word-tile word-tile--${place}${gap ? ' word-tile--gap' : ''}">${word}</button>`,
};
