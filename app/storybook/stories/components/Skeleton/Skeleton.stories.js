import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/Skeleton',
  parameters: { docs: { description: { component: readme } } },
};

// The placeholder bones of a screen that is still loading (the rule quiz uses them while the questions are made).
export const Overview = {
  render: () => `
<div class="skeleton" aria-hidden="true">
  <span class="skeleton__bone skeleton__bone--short"></span>
  <span class="skeleton__bone"></span>
  <span class="skeleton__bone skeleton__bone--medium"></span>
  <span class="skeleton__bone skeleton__bone--field"></span>
</div>
`,
};

// The loading block of the rule quiz: a small pot that moves, a line of text and a note about the wait.
export const Loading = {
  render: () => `
<div class="rule-quiz__loading" role="status" style="max-width:420px">
  <span class="rule-quiz__loading-pot"></span>
  <p class="rule-quiz__loading-text">Готую нові питання…</p>
  <p class="muted rule-quiz__loading-note">Це може тривати до хвилини.</p>
  <div class="skeleton" aria-hidden="true">
    <span class="skeleton__bone skeleton__bone--short"></span>
    <span class="skeleton__bone"></span>
    <span class="skeleton__bone skeleton__bone--medium"></span>
    <span class="skeleton__bone skeleton__bone--field"></span>
  </div>
</div>
`,
};
