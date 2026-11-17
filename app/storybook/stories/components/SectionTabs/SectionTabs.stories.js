import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/SectionTabs',
  parameters: { docs: { description: { component: readme } } },
};

export const Dictionary = {
  render: () => `
<div class="col">
  <nav class="section-tabs segmented segmented--three" aria-label="Розділи словника">
          <button type="button" data-tab="table" aria-current="page">Слова</button>
          <button type="button" data-tab="rules">Правила</button>
          <button type="button" data-tab="texts">Тексти</button>
        </nav>
</div>
`,
};

export const Progress = {
  render: () => `
<div class="col">
  <nav class="section-tabs segmented segmented--three" aria-label="Розділи прогресу">
          <button type="button" data-tab="stats">Статистика</button>
          <button type="button" data-tab="week" aria-current="page">Тиждень</button>
          <button type="button" data-tab="achievements">Досягнення</button>
        </nav>
</div>
`,
};

