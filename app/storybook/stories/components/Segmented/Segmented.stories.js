import readme from './README.md?raw';

export default {
  title: 'Components/Forms/Segmented',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="segmented" role="group" style="max-width:420px">
  <button type="button" aria-pressed="false">День</button>
  <button type="button" aria-pressed="true">Тиждень</button>
  <button type="button" aria-pressed="false">Місяць</button>
  <button type="button" aria-pressed="false">Рік</button>
  <button type="button" aria-pressed="false">Усе</button>
</div>
`,
};
