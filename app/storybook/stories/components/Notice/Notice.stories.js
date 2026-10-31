import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/Notice',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="notice" style="position:static">Немає з'єднання із сервером</div>
`,
};
