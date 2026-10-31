import readme from './README.md?raw';

export default {
  title: 'Components/Data/WordTable',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="table-wrap"><table class="words"><thead><tr><th>Слово</th><th>Глава</th><th>Переклад</th><th>Наступне</th><th></th></tr></thead>
<tbody><tr><td class="w"><span class="art">de</span> fiets</td><td>6.1</td><td>велосипед</td><td><span class="status st-learning">завтра</span></td><td><button class="del">×</button></td></tr>
<tr><td class="w"><span class="art">het</span> huis</td><td>2.3</td><td>дім</td><td><span class="status st-learned">12 лист.</span></td><td><button class="del">×</button></td></tr>
<tr><td class="w">werken</td><td>3.1</td><td>працювати</td><td><span class="status">нове</span></td><td><button class="del">×</button></td></tr></tbody></table></div>
`,
};
