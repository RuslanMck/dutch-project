import readme from './README.md?raw';

export default {
  title: 'Components/Content/WordSheet',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="story-static-sheet">
<dialog open id="word-sheet" class="sheet sheet--story" aria-labelledby="word-sheet-title">
  <div class="sheet__grab" aria-hidden="true"></div>
  <div class="sheet__head">
    <h2 id="word-sheet-title" class="sheet__title"><span class="art">de</span> fiets</h2>
  </div>
  <p id="word-sheet-translation" class="sheet__translation">велосипед</p>
  <div id="word-sheet-example" class="sheet__example">
    <p id="word-sheet-example-nl" class="sheet__example-nl">Ik ga met de fiets naar mijn werk.</p>
    <p id="word-sheet-example-uk" class="sheet__example-uk">Я їжджу на роботу на велосипеді.</p>
  </div>
  <dl id="word-sheet-details" class="sheet__details"><div class="sheet__detail"><dt>Статус</dt><dd>вивчається</dd></div><div class="sheet__detail"><dt>Наступне повторення</dt><dd>2 лист.</dd></div><div class="sheet__detail"><dt>Помилок</dt><dd>3</dd></div><div class="sheet__detail"><dt>Глава</dt><dd>6.1</dd></div></dl>
  <form method="dialog" class="sheet__actions">
    <button id="word-sheet-close" class="primary" type="submit">Закрити</button>
  </form>
</dialog>
</div>
`,
};
