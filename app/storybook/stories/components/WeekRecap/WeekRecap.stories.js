import readme from './README.md?raw';

export default {
  title: 'Components/Data/WeekRecap',
  parameters: { docs: { description: { component: readme } } },
};

// The story slides of the week (logic.js buildWeekSlides). Segments: done, timed (the one on screen) and the rest.
function weekStory({ segments, slide, periodCurrent = true, big = 'number' }) {
  const bigClass = big === 'text' ? 'week-story__big week-story__big--text' : 'week-story__big';
  const progress = segments.map(state => {
    const cls = state === 'done' ? ' week-story__segment--done' : state === 'timed' ? ' week-story__segment--timed' : '';
    return `<span class="week-story__segment${cls}"><span class="week-story__fill"></span></span>`;
  }).join('');
  return `
<div class="week-story" style="--week-tint: var(--garden-right-soft)">
  <div class="week-story__progress">${progress}</div>
  <div class="week-story__body">
    <div class="week-story__slide">
      <p class="week-story__title">${slide.title}</p>
      <p class="${bigClass}">${slide.big}</p>
      <p class="week-story__text">${slide.text}</p>
    </div>
    <button class="week-story__zone week-story__zone--back" type="button" data-week-step="-1" aria-label="Попередній слайд"></button>
    <button class="week-story__zone week-story__zone--next" type="button" data-week-step="1" aria-label="Наступний слайд"></button>
  </div>
</div>
<div class="segmented segmented--two" role="group" aria-label="Тиждень">
  <button type="button" data-week-period="current" aria-pressed="${String(periodCurrent)}">Цей тиждень</button>
  <button type="button" data-week-period="previous" aria-pressed="${String(!periodCurrent)}">Минулий тиждень</button>
</div>`;
}

const ANSWERS_SLIDE = { title: 'Цього тижня', big: '64', text: 'відповіді, 81 % правильно' };
const NEW_WORDS_SLIDE = { title: 'Нових слів', big: '9', text: 'почато, 4 вивчено' };
const BEST_DAY_SLIDE = { title: 'Найкращий день', big: 'середа', text: '21 відповідь, 85 % правильно' };
const HARDEST_SLIDE = { title: 'Найважче слово', big: 'de fiets', text: '3 помилки — воно буде частіше' };

// The current week on its second slide: the first segment is done, the second is running.
export const Overview = {
  render: () => weekStory({ segments: ['done', 'timed', 'idle', 'idle'], slide: NEW_WORDS_SLIDE }),
};

// The first slide: the answers of the week, its number counts up in the app.
export const FirstSlide = {
  render: () => weekStory({ segments: ['timed', 'idle', 'idle'], slide: ANSWERS_SLIDE }),
};

// A middle slide: the hardest word of the week, with its mistakes.
export const HardestWord = {
  render: () => weekStory({ segments: ['done', 'timed', 'idle'], slide: HARDEST_SLIDE }),
};

// The last slide: all segments are done, there is no timer on it.
export const LastSlide = {
  render: () => weekStory({ segments: ['done', 'done', 'done'], slide: BEST_DAY_SLIDE }),
};

// The previous week is shown with its own period choice.
export const PreviousWeek = {
  render: () => weekStory({ segments: ['timed', 'idle'], slide: ANSWERS_SLIDE, periodCurrent: false }),
};

// No answers this week: one slide with a short text in place of the big number.
export const Empty = {
  render: () => weekStory({
    segments: ['done'],
    big: 'text',
    slide: { title: '', big: 'Цього тижня ще немає відповідей', text: "Почни практику, і тут з'явиться підсумок" },
  }),
};
