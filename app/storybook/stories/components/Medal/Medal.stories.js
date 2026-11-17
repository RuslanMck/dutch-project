import readme from './README.md?raw';

export default {
  title: 'Components/Content/Medal',
  parameters: { docs: { description: { component: readme } } },
};

// The icon of an achievement: 24×24, 1.8 stroke, no fill (achievement-icons.js). Names: star, trophy, flame.
const ICONS = {
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-5-4-9-2 2-2 4-2 4-1-1-2-2-2-4-2 2-4 5-4 9a6 6 0 0 0 6 6z"/>',
};

const icon = name => `<svg class="achievement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

// A round badge: gold when unlocked, muted with a greyed icon when locked.
const medal = ({ name = 'star', unlocked = true, size = '' }) =>
  `<span class="medal ${unlocked ? 'medal--unlocked' : 'medal--locked'}${size ? ` medal--${size}` : ''}" aria-hidden="true">${icon(name)}</span>`;

export const Overview = {
  render: () => `
<div class="r" style="align-items:flex-end">
  ${medal({ name: 'star', unlocked: true, size: 'small' })}
  ${medal({ name: 'star', unlocked: false, size: 'small' })}
  ${medal({ name: 'trophy', unlocked: true })}
  ${medal({ name: 'trophy', unlocked: false })}
</div>
`,
};

// A small medal in the list and the toast: 44 px.
export const Small = {
  render: () => `<div class="r">${medal({ name: 'flame', unlocked: true, size: 'small' })}${medal({ name: 'flame', unlocked: false, size: 'small' })}</div>`,
};

// The large medal of the detail dialog: 88 px, centred above the title.
export const Large = {
  render: () => `<div style="max-width:320px">${medal({ name: 'trophy', unlocked: true, size: 'large' })}</div>`,
};

export const Locked = {
  render: () => `<div style="max-width:320px">${medal({ name: 'trophy', unlocked: false, size: 'large' })}</div>`,
};

export const Playground = {
  args: { name: 'star', unlocked: true, size: 'large' },
  argTypes: {
    name: { control: 'inline-radio', options: ['star', 'trophy', 'flame'] },
    size: { control: 'inline-radio', options: ['small', 'large'] },
  },
  render: ({ name, unlocked, size }) => `<div style="max-width:320px">${medal({ name, unlocked, size })}</div>`,
};
