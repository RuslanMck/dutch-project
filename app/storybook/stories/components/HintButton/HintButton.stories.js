import readme from './README.md?raw';

export default {
  title: 'Components/Actions/HintButton',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="hint-field col">
  <div class="hint-label"><label>Режим</label><button class="hint-button" type="button" aria-expanded="true">i</button></div>
  <select><option>Переклад (FSRS)</option></select>
  <p class="hint">"Артикль" — це тренування, яке нічого не змінює.</p>
</div>
`,
};
