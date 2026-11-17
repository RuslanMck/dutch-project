import readme from './README.md?raw';

export default {
  title: 'Components/Study/ArticleBoard',
  parameters: { docs: { description: { component: readme } } },
};

// The exercise: one word (the chip) and two baskets, «de» and «het». Drag the chip into a basket or tap one.
const board = ({ word = 'fiets', counts = ['0 слів', '0 слів'], basketClass = {}, chipClass = '' } = {}) => `
<section class="article-board" aria-label="Артикль">
  <div class="article-chip${chipClass ? ` ${chipClass}` : ''}" tabindex="0" aria-keyshortcuts="ArrowLeft ArrowRight">${word}</div>
  <div class="article-baskets">
    <button class="article-basket${basketClass.de ? ` ${basketClass.de}` : ''}" type="button" data-article="de">
      <span class="article-basket__name">de</span>
      <span class="article-basket__count muted">${counts[0]}</span>
    </button>
    <button class="article-basket${basketClass.het ? ` ${basketClass.het}` : ''}" type="button" data-article="het">
      <span class="article-basket__name">het</span>
      <span class="article-basket__count muted">${counts[1]}</span>
    </button>
  </div>
  <p class="muted article-hint">Натисни на кошик або перетягни в нього слово</p>
</section>`;

// The start of the exercise: the word is shown, both baskets are empty.
export const Overview = {
  render: () => board(),
};

// The chip is held and dragged: it lifts with a shadow and the basket under it is marked.
export const Dragging = {
  render: () => board({ chipClass: 'article-chip--dragging', basketClass: { de: 'article-basket--over' } }),
};

// A right answer: the chip has flown into its basket, the basket glows and shows its new count.
export const Right = {
  render: () => board({ word: 'fiets', counts: ['1 слово', '0 слів'], basketClass: { de: 'article-basket--right' }, chipClass: 'article-chip--gone' }),
};

// A wrong answer: the chip stays and the wrong basket shakes once; the right one is shown next time.
export const Wrong = {
  render: () => board({ word: 'boek', counts: ['0 слів', '2 слова'], basketClass: { de: 'article-basket--shake' } }),
};

// A long word with the baskets already full: the counts use the plural form for many.
export const ManyWords = {
  render: () => board({ word: 'aardappelschilmesje', counts: ['12 слів', '5 слів'] }),
};
