import readme from './README.md?raw';

export default {
  title: 'Components/Data/WordTable',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="table-wrap"><table class="words"><thead><tr><th>Слово</th><th>Глава</th><th>Переклад</th><th>Наступне</th><th></th></tr></thead>
<tbody><tr><td class="w"><button class="word-link" type="button"><span class="art">de</span> fiets</button></td><td>6.1</td><td>велосипед</td><td><span class="status st-learning">завтра</span></td><td><button class="del" type="button" aria-label="Видалити"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>
<tr><td class="w"><button class="word-link" type="button"><span class="art">het</span> huis</button></td><td>2.3</td><td>дім</td><td><span class="status st-learned">12 лист.</span></td><td><button class="del" type="button" aria-label="Видалити"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>
<tr><td class="w"><button class="word-link" type="button">werken</button></td><td>3.1</td><td>працювати</td><td><span class="status">нове</span></td><td><button class="del" type="button" aria-label="Видалити"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr></tbody></table></div>
`,
};
