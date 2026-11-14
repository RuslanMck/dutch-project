// The achievements: groups and the catalog of medals, with their titles and descriptions already written in Ukrainian.
// Pure: each medal names the metric it counts (see achievement-facts.js) and its target. A category medal also names
// its category.
import { WORD_CATEGORIES } from '../../contracts/category-contracts.js';
import { pluralize } from '../ukrainian-plural.js';

const WORD_FORMS = ['слово', 'слова', 'слів'];
const DAY_FORMS = ['день', 'дні', 'днів'];
const ANSWER_FORMS = ['відповідь', 'відповіді', 'відповідей'];
const TIME_FORMS = ['раз', 'рази', 'разів'];
const SENTENCE_FORMS = ['речення', 'речення', 'речень'];
const CATEGORY_TARGETS = Object.freeze([5, 10, 15, 25, 50]);
const EXCLUDED_CATEGORY_ID = 'other';

export const ACHIEVEMENT_GROUPS = Object.freeze([
  Object.freeze({ id: 'words', title: 'Слова' }),
  Object.freeze({ id: 'streak', title: 'Серія днів' }),
  Object.freeze({ id: 'answers', title: 'Відповіді' }),
  Object.freeze({ id: 'days', title: 'Дні практики' }),
  Object.freeze({ id: 'goal', title: 'Ціль на день' }),
  Object.freeze({ id: 'perfect', title: 'Без помилок' }),
  Object.freeze({ id: 'fast', title: 'Швидкість' }),
  Object.freeze({ id: 'order', title: 'Порядок слів' }),
  Object.freeze({ id: 'rules', title: 'Вправи з правил' }),
  Object.freeze({ id: 'drill', title: 'Тренування' }),
  Object.freeze({ id: 'habits', title: 'Звички' }),
  Object.freeze({ id: 'categories', title: 'Теми слів' }),
]);

// n as a number with its noun: count(10, WORD_FORMS) is '10 слів'.
function count(n, forms) {
  return `${n} ${pluralize(n, forms)}`;
}

function achievement({ id, group, metric, target, icon, title, description, category }) {
  return Object.freeze({ id, group, metric, target, icon, title, description, category: category ?? null });
}

const wordMedals = [10, 25, 50, 100, 250, 500, 1000].map(target => achievement({
  id: `words-${target}`, group: 'words', metric: 'learned_words', target, icon: 'star',
  title: `Вивчено ${count(target, WORD_FORMS)}`,
  description: `Вивчи ${count(target, WORD_FORMS)} в обидва боки`,
}));

const streakMedals = [3, 7, 14, 30, 60, 100].map(target => achievement({
  id: `streak-${target}`, group: 'streak', metric: 'longest_streak', target, icon: 'flame',
  title: `${count(target, DAY_FORMS)} поспіль`,
  description: `Практикуй ${count(target, DAY_FORMS)} без пропусків`,
}));

const answerMedals = [100, 500, 1000, 5000, 10000].map(target => achievement({
  id: `answers-${target}`, group: 'answers', metric: 'answers', target, icon: 'check',
  title: count(target, ANSWER_FORMS),
  description: `Дай ${count(target, ANSWER_FORMS)} у практиці`,
}));

const dayMedals = [10, 30, 100, 365].map(target => achievement({
  id: `days-${target}`, group: 'days', metric: 'days_practised', target, icon: 'calendar',
  title: `${count(target, DAY_FORMS)} практики`,
  description: `Практикуй у ${target} різних ${pluralize(target, DAY_FORMS)}`,
}));

const goalMedals = [1, 7, 30, 100].map(target => achievement({
  id: `goal-${target}`, group: 'goal', metric: 'goal_days', target, icon: 'target',
  title: `Ціль виконано ${count(target, TIME_FORMS)}`,
  description: `Досягни денної цілі ${count(target, TIME_FORMS)}`,
}));

const perfectMedals = [1, 10, 50].map(target => achievement({
  id: `perfect-${target}`, group: 'perfect', metric: 'perfect_sets', target, icon: 'leaf',
  title: `Ідеальний набір: ${target}`,
  description: `Заверши набір без жодної помилки ${count(target, TIME_FORMS)}`,
}));

const fastMedals = [5, 10, 20].map(target => achievement({
  id: `fast-${target}`, group: 'fast', metric: 'most_words_learned_in_day', target, icon: 'bolt',
  title: `${count(target, WORD_FORMS)} за день`,
  description: `Вивчи ${count(target, WORD_FORMS)} за один день`,
}));

const orderMedals = [
  ...[10, 50, 200].map(target => achievement({
    id: `order-${target}`, group: 'order', metric: 'order_correct', target, icon: 'sentence',
    title: `${count(target, SENTENCE_FORMS)} правильно`,
    description: `Склади ${count(target, SENTENCE_FORMS)} правильно`,
  })),
  achievement({
    id: 'order-run-10', group: 'order', metric: 'order_run', target: 10, icon: 'sentence',
    title: '10 речень поспіль',
    description: 'Склади 10 речень поспіль без помилки',
  }),
];

const ruleMedals = [
  ...[10, 50, 200].map(target => achievement({
    id: `rules-${target}`, group: 'rules', metric: 'rules_correct', target, icon: 'rule',
    title: `${target} правильних ${pluralize(target, ANSWER_FORMS)}`,
    description: `Дай ${target} правильних ${pluralize(target, ANSWER_FORMS)} у вправах`,
  })),
  achievement({
    id: 'rules-run-10', group: 'rules', metric: 'rules_run', target: 10, icon: 'rule',
    title: '10 правильних поспіль',
    description: 'Дай 10 правильних відповідей поспіль',
  }),
];

const drillMedals = [100, 500].map(target => achievement({
  id: `drill-${target}`, group: 'drill', metric: 'drill_answers', target, icon: 'bolt',
  title: `${count(target, ANSWER_FORMS)} у тренуванні`,
  description: `Дай ${count(target, ANSWER_FORMS)} у тренуваннях і колодах`,
}));

const habitMedals = [
  achievement({
    id: 'early-bird', group: 'habits', metric: 'early_answers', target: 1, icon: 'sun',
    title: 'Ранній птах', description: 'Практикуй до 8:00',
  }),
  achievement({
    id: 'night-owl', group: 'habits', metric: 'night_answers', target: 1, icon: 'moon',
    title: 'Нічна сова', description: 'Практикуй о 23:00 чи пізніше',
  }),
  achievement({
    id: 'weekend', group: 'habits', metric: 'weekends', target: 1, icon: 'weekend',
    title: 'Вихідні з користю', description: 'Практикуй і в суботу, і в неділю',
  }),
  achievement({
    id: 'comeback', group: 'habits', metric: 'comebacks', target: 1, icon: 'return',
    title: 'Повернення', description: 'Повернися до практики після перерви в 3 дні',
  }),
];

const categoryMedals = WORD_CATEGORIES
  .filter(category => category.id !== EXCLUDED_CATEGORY_ID)
  .flatMap(category => CATEGORY_TARGETS.map(target => achievement({
    id: `${category.id}-${target}`, group: 'categories', metric: 'category_words', target, icon: category.id,
    category: category.id,
    title: `«${category.name}»: ${target}`,
    description: `Вивчи ${count(target, WORD_FORMS)} теми «${category.name}»`,
  })));

export const ACHIEVEMENT_CATALOG = Object.freeze([
  ...wordMedals, ...streakMedals, ...answerMedals, ...dayMedals, ...goalMedals, ...perfectMedals, ...fastMedals,
  ...orderMedals, ...ruleMedals, ...drillMedals, ...habitMedals, ...categoryMedals,
]);
