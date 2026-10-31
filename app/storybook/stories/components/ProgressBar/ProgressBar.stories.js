import readme from './README.md?raw';

export default {
  title: 'Components/Data/ProgressBar',
  parameters: { docs: { description: { component: readme } } },
};

export const Playground = {
  args: { percent: 60 },
  argTypes: { percent: { control: { type: 'range', min: 0, max: 100, step: 5 } } },
  render: ({ percent }) => `<div class="col"><div class="progress-bar" role="progressbar" aria-label="Прогрес набору" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span class="progress-bar__fill" style="width:${percent}%"></span></div></div>`,
};
