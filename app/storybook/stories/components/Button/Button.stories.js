import readme from './README.md?raw';

export default {
  title: 'Components/Actions/Button',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="r">
  <button class="primary" type="button">Перевірити</button>
  <button type="button">Не знаю</button>
  <button class="ghost" type="button">Вийти</button>
  <button class="danger" type="button">Видалити</button>
  <button type="button" disabled style="opacity:.5">Додати слова</button>
</div>
`,
};

export const Playground = {
  args: { label: 'Перевірити', variant: 'primary', disabled: false },
  argTypes: { variant: { control: 'inline-radio', options: ['primary', 'default', 'ghost', 'danger'] } },
  render: ({ label, variant, disabled }) =>
    `<button type="button" class="${variant === 'default' ? '' : variant}" ${disabled ? 'disabled' : ''}>${label}</button>`,
};
