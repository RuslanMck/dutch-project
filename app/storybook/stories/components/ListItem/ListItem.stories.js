import readme from './README.md?raw';

export default {
  title: 'Components/Content/ListItem',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<ul class="list col"><li class="item"><div class="item-main"><b>Hoe gaat het?</b><div class="muted">Як справи? · Діалог 2</div></div><button class="del">×</button></li>
<li class="item"><div class="item-main"><b>Dat maakt niet uit.</b><div class="muted">Це не має значення.</div></div><button class="del">×</button></li></ul>
`,
};
