import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/Message',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<p class="msg ok">Правильно</p>
<p class="msg bad">Неправильно: de fiets</p>
<p class="muted">Наступне повторення: через 3 дні</p>
`,
};

export const Answer = {
  args: { correct: true, text: 'Правильно' },
  render: ({ correct, text }) => `<p class="msg ${correct ? 'ok' : 'bad'}">${text}</p>`,
};
