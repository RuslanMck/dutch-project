# Story template

Copy into `app/storybook/stories/components/<Name>/<Name>.stories.js` and replace the markup with the app's own.

```js
import readme from './README.md?raw';

export default {
  title: 'Components/<Group>/<Name>',
  parameters: { docs: { description: { component: readme } } },
};

// Every variant side by side, with the app's real markup.
export const Overview = {
  render: () => `
<div class="r">
  <button class="primary" type="button">Перевірити</button>
  <button type="button">Не знаю</button>
</div>
`,
};

// One story per meaningful state.
export const Disabled = {
  render: () => '<button type="button" disabled>Додати слова</button>',
};

export const LongText = {
  render: () => '<button type="button">Почати тренування з важкими словами</button>',
};

// Controls for components with variants.
export const Playground = {
  args: { label: 'Перевірити', variant: 'primary', disabled: false },
  argTypes: { variant: { control: 'inline-radio', options: ['primary', 'default', 'ghost', 'danger'] } },
  render: ({ label, variant, disabled }) =>
    `<button type="button" class="${variant === 'default' ? '' : variant}" ${disabled ? 'disabled' : ''}>${label}</button>`,
};
```

# README template

Copy into `app/storybook/stories/components/<Name>/README.md`. No H1.

```markdown
<One sentence: what it is and where it appears in the app.>

- `.variant` — what it looks like (`garden-*` tokens) and when to use it.
- `.other-variant` — …

Use it for … Don't use it for … (point to the component to use instead).

Accessibility: <labels, aria attributes, keyboard, contrast notes>.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
```
