import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/PageHeader',
  parameters: { docs: { description: { component: readme } } },
  argTypes: { title: { control: 'text' }, subtitle: { control: 'text' } },
};

const header = ({ title, subtitle }) => `
<div class="app" style="padding-bottom:16px">
  <header class="top">
    <h1 class="top__title">${title}</h1>
    <p class="top__subtitle">${subtitle}</p>
  </header>
</div>
`;

export const Overview = { render: () => header({ title: 'Статистика', subtitle: 'Як іде навчання' }) };
export const LongText = { render: () => header({ title: 'Порядок слів', subtitle: 'Граматика з номерами правил і довгими поясненнями' }) };
export const Playground = { args: { title: 'Практика', subtitle: 'Переклад слів за розкладом' }, render: header };
