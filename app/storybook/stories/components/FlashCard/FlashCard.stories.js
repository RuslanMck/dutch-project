import readme from './README.md?raw';

export default {
  title: 'Components/Study/FlashCard',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
<button class="card" type="button"><span id="card-body"><span class="card-nl"><span class="art">de</span> fiets</span><span class="card-uk">велосипед</span><span class="card-ex">Ik ga met de fiets naar mijn werk.</span></span></button>
<div class="card-actions"><button type="button">Не знаю</button><button class="primary" type="button">Далі</button></div>
<div class="card-grades"><button type="button">Знову</button><button type="button">Важко</button><button type="button">Добре</button></div>
</div>
`,
};
