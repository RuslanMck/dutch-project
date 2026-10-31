import readme from './README.md?raw';

export default {
  title: 'Components/Content/TextCard',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<article class="text-card col"><h3 class="text-title">Op de markt</h3><p class="muted">Глава 4 · 120 слів</p><div class="pre-wrap">Op zaterdag ga ik naar de markt. Ik koop groente en fruit…</div></article>
`,
};
