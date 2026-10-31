import readme from './README.md?raw';

export default {
  title: 'Components/Forms/FilterChips',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="deck-chips" role="group">
  <button type="button" aria-pressed="true">Усі</button>
  <button type="button" aria-pressed="false">Важкі</button>
  <button type="button" aria-pressed="false">Середні</button>
  <button type="button" aria-pressed="false">Легкі</button>
  <button type="button" aria-pressed="false">Нові</button>
  <button type="button" aria-pressed="false">Обрані</button>
</div>
`,
};
