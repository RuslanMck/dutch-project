import readme from './README.md?raw';

export default {
  title: 'Components/Data/HomeNumbers',
  parameters: { docs: { description: { component: readme } } },
};

const tile = (value, label) => `<div class="stat-tile home-number">
      <span class="stat-tile__value">${value}</span>
      <span class="stat-tile__label">${label}</span>
    </div>`;

const numbers = (tiles) => `<div class="col"><section class="home-numbers" aria-label="Цифри">
  <div class="home-numbers__tiles">${tiles.join('')}</div>
</section></div>`;

export const Overview = {
  render: () => numbers([
    tile('78', 'слів учу'),
    tile('0', 'нових сьогодні'),
    tile('48%', 'правильно за 7 днів'),
  ]),
};

export const Unknown = {
  render: () => numbers([
    tile('—', 'слів учу'),
    tile('—', 'нових сьогодні'),
    tile('—', 'правильно за 7 днів'),
  ]),
};

export const OneWord = {
  render: () => numbers([
    tile('1', 'слово вчу'),
    tile('1', 'нове сьогодні'),
    tile('100%', 'правильно за 7 днів'),
  ]),
};
