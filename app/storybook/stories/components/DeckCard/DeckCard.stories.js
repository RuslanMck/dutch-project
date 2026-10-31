import readme from './README.md?raw';

export default {
  title: 'Components/Content/DeckCard',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
<div class="deck-card"><h3 class="deck-card__name">Транспорт</h3><p class="deck-card__description muted">Слова з глави 6 про дорогу на роботу.</p><p class="deck-card__count muted">24 слова</p>
<div class="deck-card__actions"><button class="primary">Тренувати</button><button>Змінити</button><button class="ghost">Видалити</button></div></div>
<ul class="deck-catalog"><li class="deck-row"><label class="deck-row__label"><input class="deck-row__check" type="checkbox" checked><span class="deck-row__text"><span class="deck-row__word"><span class="art">de</span> fiets — велосипед</span><span class="deck-row__meta muted"><span class="difficulty-badge difficulty-badge--hard">важке</span>6.1</span></span></label></li></ul>
<div class="deck-bar" style="position:static"><p class="deck-bar__count">Обрано: 24</p><button class="primary">Додати слова</button></div>
</div>
`,
};
