import readme from './README.md?raw';

export default {
  title: 'Components/Study/ContinueCard',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
      <section class="continue-card" aria-labelledby="home-continue-title">
        <div class="continue-card__top">
          <span class="continue-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h9"/></svg></span>
          <div class="continue-card__text">
            <h2 id="home-continue-title" class="continue-card__title">Практика на сьогодні</h2>
            <p id="home-continue-line" class="continue-card__line">До повторення: 14 · вчу: 25</p>
          </div>
          <button id="home-continue-button" class="continue-card__button" type="button" aria-label="Відкрити практику"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        </div>
        <div class="progress-bar" role="progressbar" aria-labelledby="home-progress-label" aria-valuemin="0" aria-valuemax="100"
          id="home-progress"><span id="home-progress-fill" class="progress-bar__fill" style="width:40%"></span></div>
        <p id="home-progress-label" class="continue-card__progress-label">Почато 240 з 601 слів · 40%</p>
      </section>
</div>
`,
};
