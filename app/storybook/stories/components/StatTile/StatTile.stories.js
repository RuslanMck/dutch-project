import readme from './README.md?raw';

export default {
  title: 'Components/Data/StatTile',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="stat-tiles" style="max-width:420px">
<div class="stat-tile"><span class="stat-tile__label">Відповідей</span><span class="stat-tile__value">128</span><span class="stat-tile__delta">+24 до минулого тижня</span></div>
<div class="stat-tile"><span class="stat-tile__label">Точність</span><span class="stat-tile__value">86%</span><span class="stat-tile__delta">+3 п.п.</span></div>
<div class="stat-tile"><span class="stat-tile__label">Вивчено</span><span class="stat-tile__value">412</span></div>
<div class="stat-tile"><span class="stat-tile__label">Серія</span><span class="stat-tile__value">9 днів</span></div>
</div>
`,
};
