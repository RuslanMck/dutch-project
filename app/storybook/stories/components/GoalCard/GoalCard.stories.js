import readme from './README.md?raw';

export default {
  title: 'Components/Data/GoalCard',
  parameters: { docs: { description: { component: readme } } },
};

// The same words as app.js (logic.js): «Ще N відповідей до цілі» and the reached line.
const GOAL_REACHED_TEXT = 'Ціль виконано! Можна ще, але вже без поспіху.';

function answersWord(count) {
  const last = count % 10;
  const teen = Math.floor(count / 10) % 10 === 1;
  if (!teen && last === 1) return 'відповідь';
  if (!teen && last >= 2 && last <= 4) return 'відповіді';
  return 'відповідей';
}

// The ring is a pathLength 100 circle; app.js sets its stroke-dashoffset to 100 - percent.
function goalCard({ answers, goal }) {
  const target = Math.max(1, goal);
  const remaining = target - answers;
  const reached = remaining <= 0;
  const percent = Math.min(100, Math.round((answers / target) * 100));
  const line = reached ? GOAL_REACHED_TEXT : `Ще ${remaining} ${answersWord(remaining)} до цілі`;
  return `
<section class="goal-card${reached ? ' goal-card--reached' : ''}" aria-label="Ціль на день">
  <div class="goal-card__ring">
    <svg class="goal-ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle class="goal-ring__track" cx="60" cy="60" r="50" pathLength="100"/>
      <circle class="goal-ring__arc" cx="60" cy="60" r="50" pathLength="100" style="stroke-dashoffset: ${100 - percent}"/>
    </svg>
    <span class="goal-ring__number"><span>${answers}</span><small>з ${target}</small></span>
  </div>
  <div class="goal-card__text">
    <h2 class="goal-card__title">Ціль на день</h2>
    <p class="goal-card__line" role="status">${line}</p>
  </div>
</section>`;
}

// The card on Головна: the ring fills with each answer, and the line says what is left.
export const Overview = {
  render: () => `<div class="col" style="max-width:420px">${goalCard({ answers: 6, goal: 10 })}${goalCard({ answers: 12, goal: 10 })}</div>`,
};

export const InProgress = {
  render: () => goalCard({ answers: 6, goal: 10 }),
};

// Nothing answered yet: the ring is empty and the line counts the whole goal.
export const Start = {
  render: () => goalCard({ answers: 0, goal: 10 }),
};

// The goal is reached: the card takes the forest arc and the reached line.
export const Reached = {
  render: () => goalCard({ answers: 12, goal: 10 }),
};

export const Playground = {
  args: { answers: 6, goal: 10 },
  argTypes: {
    answers: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    goal: { control: { type: 'range', min: 5, max: 100, step: 5 } },
  },
  render: ({ answers, goal }) => goalCard({ answers, goal }),
};
