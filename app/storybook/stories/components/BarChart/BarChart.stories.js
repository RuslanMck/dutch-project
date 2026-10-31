import readme from './README.md?raw';

export default {
  title: 'Components/Data/BarChart',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<section class="stats-card" style="max-width:420px;margin:0"><h2 class="stats-card__title">Відповіді за тиждень</h2>
<div class="bar-chart"><button class="bar-chart__column" ><span class="bar-chart__bar" style="height:30%"></span><span class="bar-chart__label">пн</span></button><button class="bar-chart__column" ><span class="bar-chart__bar" style="height:55%"></span><span class="bar-chart__label">вт</span></button><button class="bar-chart__column" ><span class="bar-chart__bar" style="height:20%"></span><span class="bar-chart__label">ср</span></button><button class="bar-chart__column" ><span class="bar-chart__bar" style="height:80%"></span><span class="bar-chart__label">чт</span></button><button class="bar-chart__column" aria-pressed="true"><span class="bar-chart__bar" style="height:100%"></span><span class="bar-chart__label">пт</span></button><button class="bar-chart__column" ><span class="bar-chart__bar" style="height:45%"></span><span class="bar-chart__label">сб</span></button><button class="bar-chart__column" ><span class="bar-chart__bar" style="height:10%"></span><span class="bar-chart__label">нд</span></button></div>
<p class="muted bar-chart__detail">пт: 34 відповіді</p></section>
`,
};
