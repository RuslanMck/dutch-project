import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/StatusPill',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="r">
  <span class="status">нове</span>
  <span class="status st-learning">вчу</span>
  <span class="status st-learned">вивчено</span>
  <span class="difficulty-badge difficulty-badge--easy">легке</span>
  <span class="difficulty-badge difficulty-badge--medium">середнє</span>
  <span class="difficulty-badge difficulty-badge--hard">важке</span>
  <span class="badge">3</span>
  <span><span class="art">de</span> fiets</span>
</div>
`,
};

const statusClass = { нове: '', вчу: 'st-learning', вивчено: 'st-learned' };

export const Status = {
  args: { status: 'вчу' },
  argTypes: { status: { control: 'inline-radio', options: Object.keys(statusClass) } },
  render: ({ status }) => `<span class="status ${statusClass[status]}">${status}</span>`,
};

export const Difficulty = {
  args: { level: 'medium', label: 'середнє' },
  argTypes: { level: { control: 'inline-radio', options: ['easy', 'medium', 'hard', 'new'] } },
  render: ({ level, label }) => `<span class="difficulty-badge difficulty-badge--${level}">${label}</span>`,
};
