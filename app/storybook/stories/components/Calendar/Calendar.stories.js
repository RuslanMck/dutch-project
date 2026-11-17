import readme from './README.md?raw';

export default {
  title: 'Components/Data/Calendar',
  parameters: { docs: { description: { component: readme } } },
};

const ANSWER_WORDS = ['відповідь', 'відповіді', 'відповідей'];

function answersWord(count) {
  const last = count % 10;
  const teen = Math.floor(count / 10) % 10 === 1;
  if (!teen && last === 1) return ANSWER_WORDS[0];
  if (!teen && last >= 2 && last <= 4) return ANSWER_WORDS[1];
  return ANSWER_WORDS[2];
}

// Same thresholds as calendarLevel() in logic.js: 0, 1–14, 15–34, 35–59, 60+.
function level(answers) {
  if (answers <= 0) return 0;
  if (answers <= 14) return 1;
  if (answers <= 34) return 2;
  if (answers <= 59) return 3;
  return 4;
}

// Five weeks, Monday first: 12.10 to 15.11. The numbers are fixed sample answers per day.
const ANSWERS = [
  0, 12, 30, 0, 64, 22, 8,
  0, 45, 0, 0, 71, 18, 9,
  3, 0, 27, 33, 15, 0, 5,
  52, 60, 11, 0, 0, 20, 0,
  0, 9, 14, 38, 2, 0, 0,
];
const DAY_START = Date.UTC(2026, 9, 12);

function cellsFor(answers) {
  return answers.map((count, index) => {
    const date = new Date(DAY_START + index * 86400000);
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const iso = `2026-${mm}-${dd}`;
    const accuracy = 70 + ((index * 7) % 25);
    const label = count
      ? `${dd}.${mm}: ${count} ${answersWord(count)}, ${accuracy} % правильно`
      : `${dd}.${mm}: без практики`;
    const column = Math.floor(index / 7);
    return { iso, label, column, level: level(count), count };
  });
}

// Each cell is a button with its day in aria-label; the selected one has aria-pressed="true".
const grid = (answers, selectedIso = '') => cellsFor(answers).map(cell => `
  <button type="button" class="calendar__cell calendar__cell--l${cell.level}" style="--col: ${cell.column}" data-date="${cell.iso}"
    aria-label="${cell.label}" aria-pressed="${String(cell.iso === selectedIso)}"></button>`).join('');

const legend = `
<div class="calendar__legend" aria-hidden="true">
  <span>менше</span>
  <span class="calendar__cell calendar__cell--l0"></span>
  <span class="calendar__cell calendar__cell--l1"></span>
  <span class="calendar__cell calendar__cell--l2"></span>
  <span class="calendar__cell calendar__cell--l3"></span>
  <span class="calendar__cell calendar__cell--l4"></span>
  <span>більше</span>
</div>`;

const calendar = ({ answers, selectedIso = '', detail = 'Торкнися дня, щоб побачити деталі.' }) => `
<section class="stats-card" style="max-width:420px" aria-label="Календар занять">
  <h2 class="stats-card__title">Календар занять</h2>
  <div class="calendar__scroll">
    <div class="calendar__grid">${grid(answers, selectedIso)}
    </div>
  </div>
  <p class="muted calendar__detail" aria-live="polite">${detail}</p>
  ${legend}
</section>`;

const SELECTED = '2026-11-02';
const selectedLabel = cellsFor(ANSWERS).find(cell => cell.iso === SELECTED).label;

// The stats page calendar: one cell per day, weeks as columns, darker cells for more answers.
export const Overview = {
  render: () => calendar({ answers: ANSWERS }),
};

// A day is tapped: aria-pressed marks it and the detail line names it.
export const DaySelected = {
  render: () => calendar({ answers: ANSWERS, selectedIso: SELECTED, detail: selectedLabel }),
};

// A new user: every day is level 0 and the cells are the pale tint.
export const Empty = {
  render: () => calendar({ answers: ANSWERS.map(() => 0) }),
};

// Only the colour scale, as the legend shows it.
export const Legend = {
  render: () => legend,
};
