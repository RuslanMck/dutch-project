// Achievements: the Ukrainian plural forms, the catalog, the facts of one read (pure), and the list the service builds.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORD_CATEGORIES } from '../src/contracts/category-contracts.js';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_GROUPS } from '../src/domains/achievements/achievement-catalog.js';
import { calculateAchievementFacts } from '../src/domains/achievements/achievement-facts.js';
import { createAchievementService } from '../src/domains/achievements/achievement-service.js';
import { pluralize } from '../src/domains/ukrainian-plural.js';
import { createTestContext } from './database-test-helpers.js';

const TIME_ZONE = 'Europe/Amsterdam';
const medal = id => ACHIEVEMENT_CATALOG.find(achievement => achievement.id === id);

test('pluralize picks the Ukrainian form by count', () => {
  const words = ['слово', 'слова', 'слів'];
  assert.equal(pluralize(1, words), 'слово');
  assert.equal(pluralize(2, words), 'слова');
  assert.equal(pluralize(5, words), 'слів');
  assert.equal(pluralize(11, words), 'слів');
  assert.equal(pluralize(21, words), 'слово');
  assert.equal(pluralize(112, words), 'слів');
  assert.equal(pluralize(1, ['день', 'дні', 'днів']), 'день');
  assert.equal(pluralize(3, ['день', 'дні', 'днів']), 'дні');
  assert.equal(pluralize(5, ['день', 'дні', 'днів']), 'днів');
  assert.equal(pluralize(1, ['відповідь', 'відповіді', 'відповідей']), 'відповідь');
  assert.equal(pluralize(2, ['відповідь', 'відповіді', 'відповідей']), 'відповіді');
  assert.equal(pluralize(5, ['відповідь', 'відповіді', 'відповідей']), 'відповідей');
  assert.equal(pluralize(1, ['раз', 'рази', 'разів']), 'раз');
  assert.equal(pluralize(2, ['раз', 'рази', 'разів']), 'рази');
  assert.equal(pluralize(5, ['раз', 'рази', 'разів']), 'разів');
  assert.equal(pluralize(1, ['речення', 'речення', 'речень']), 'речення');
  assert.equal(pluralize(5, ['речення', 'речення', 'речень']), 'речень');
});

test('the catalog has every medal of the plan: 128, in thirteen groups (meta first), ids unique', () => {
  assert.equal(ACHIEVEMENT_GROUPS.length, 13);
  assert.deepEqual(ACHIEVEMENT_GROUPS.map(group => group.id), [
    'meta', 'words', 'streak', 'answers', 'days', 'goal', 'perfect', 'fast', 'order', 'rules', 'drill', 'habits', 'categories',
  ]);
  assert.equal(ACHIEVEMENT_CATALOG.length, 128);
  assert.equal(new Set(ACHIEVEMENT_CATALOG.map(achievement => achievement.id)).size, 128);
  const groupIds = new Set(ACHIEVEMENT_GROUPS.map(group => group.id));
  assert.ok(ACHIEVEMENT_CATALOG.every(achievement => groupIds.has(achievement.group)));
});

test('the category medals are 5, 10, 15, 25 and 50 words for every category but other', () => {
  const categoryMedals = ACHIEVEMENT_CATALOG.filter(achievement => achievement.group === 'categories');
  assert.equal(categoryMedals.length, (WORD_CATEGORIES.length - 1) * 5);
  assert.ok(!categoryMedals.some(achievement => achievement.category === 'other'));
  assert.equal(medal('food-5').title, '«Їжа й напої»: 5');
  assert.equal(medal('food-5').description, 'Вивчи 5 слів теми «Їжа й напої»');
  assert.equal(medal('talk-50').icon, 'talk');
});

test('the titles and descriptions use the right Ukrainian forms', () => {
  assert.equal(medal('words-10').title, 'Вивчено 10 слів');
  assert.equal(medal('streak-3').title, '3 дні поспіль');
  assert.equal(medal('streak-7').title, '7 днів поспіль');
  assert.equal(medal('streak-7').description, 'Практикуй 7 днів без пропусків');
  assert.equal(medal('goal-1').title, 'Ціль виконано 1 раз');
  assert.equal(medal('goal-7').title, 'Ціль виконано 7 разів');
  assert.equal(medal('goal-1').description, 'Досягни денної цілі 1 раз');
  assert.equal(medal('answers-100').title, '100 відповідей');
  assert.equal(medal('perfect-1').description, 'Заверши набір без жодної помилки 1 раз');
  assert.equal(medal('order-10').description, 'Склади 10 речень правильно');
  assert.equal(medal('order-run-10').title, '10 речень поспіль');
  assert.equal(medal('rules-10').title, '10 правильних відповідей');
  assert.equal(medal('days-365').title, '365 днів практики');
  assert.equal(medal('comeback').description, 'Повернися до практики після перерви в 3 дні');
});

const TODAY = Date.parse('2026-11-14T10:00:00+01:00');
const YESTERDAY = Date.parse('2026-11-13T10:00:00+01:00');

// Facts from plain rows: the time zone is Amsterdam (UTC+1 in November).
function calculateFacts(overrides = {}) {
  return calculateAchievementFacts({
    now: Date.parse('2026-11-14T12:00:00+01:00'),
    timeZone: TIME_ZONE,
    dailyGoal: 20,
    words: [],
    activityAnswers: [],
    deckAnswers: [],
    deckSessionAnswers: [],
    orderAnswers: [],
    ruleAnswers: [],
    ...overrides,
  });
}

const answerAt = (localDateTime, kind = 'word', grade = 'good') => ({
  kind, grade, answered_at: Date.parse(`${localDateTime}+01:00`),
});

test('the facts count learned words per category, and only learned ones', () => {
  const facts = calculateFacts({
    words: [
      { status: 'learned', category: 'food' },
      { status: 'learned', category: 'food' },
      { status: 'learning', category: 'food' },
      { status: 'learned', category: null },
    ],
  });
  assert.equal(facts.learned_words, 3);
  assert.deepEqual(facts.category_words, { food: 2 });
});

test('the facts count days, the streak, the goal days and the answers before 8 and from 23', () => {
  const activityAnswers = [
    answerAt('2026-11-07T07:30:00'), answerAt('2026-11-07T10:00:00'),
    answerAt('2026-11-08T10:00:00', 'drill'),
    answerAt('2026-11-09T23:15:00'),
    answerAt('2026-11-10T10:00:00'),
  ];
  const facts = calculateFacts({ activityAnswers, dailyGoal: 2 });
  assert.equal(facts.answers, 5);
  assert.equal(facts.days_practised, 4);
  assert.equal(facts.longest_streak, 4);
  assert.equal(facts.drill_answers, 1);
  assert.equal(facts.early_answers, 1);
  assert.equal(facts.night_answers, 1);
  assert.equal(facts.goal_days, 1);
});

test('the comeback counts a gap of three days without answers, and the weekend needs Saturday and Sunday', () => {
  // 2026-11-07 is a Saturday, 2026-11-08 a Sunday.
  const facts = calculateFacts({
    activityAnswers: [
      answerAt('2026-11-02T10:00:00'), answerAt('2026-11-06T10:00:00'), answerAt('2026-11-07T10:00:00'),
      answerAt('2026-11-08T10:00:00'),
    ],
  });
  assert.equal(facts.comebacks, 1);
  assert.equal(facts.weekends, 1);
  assert.equal(calculateFacts({ activityAnswers: [answerAt('2026-11-07T10:00:00')] }).weekends, 0);
});

test('the facts count perfect sets, order and rule runs', () => {
  const facts = calculateFacts({
    deckSessionAnswers: [
      ...['s1', 's1', 's1', 's1', 's1'].map(sessionId => ({ session_id: sessionId, grade: 'good', answered_at: YESTERDAY })),
      ...['s2', 's2', 's2', 's2', 's2'].map((sessionId, index) => ({
        session_id: sessionId, grade: index === 2 ? 'hard' : 'good', answered_at: YESTERDAY,
      })),
      { session_id: 's3', grade: 'good', answered_at: YESTERDAY },
      // Today's session may still get a mistake: not counted yet.
      ...['s4', 's4', 's4', 's4', 's4'].map(sessionId => ({ session_id: sessionId, grade: 'good', answered_at: TODAY })),
    ],
    orderAnswers: [1, 1, 0, 1, 1, 1].map((isCorrect, index) => ({ is_correct: isCorrect, answered_at: index })),
    ruleAnswers: [1, 0, 1, 1].map((isCorrect, index) => ({ is_correct: isCorrect, answered_at: index })),
  });
  assert.equal(facts.perfect_sets, 1);
  assert.equal(facts.order_correct, 5);
  assert.equal(facts.order_run, 3);
  assert.equal(facts.rules_correct, 3);
  assert.equal(facts.rules_run, 2);
});

test('the most words learned in one day are counted by the day of each moment', () => {
  // A word leaves the deck (learned) on its last answer: uk_nl answered first (as New, so nl_uk enters too), then both
  // directions answered until the required count is reached and each direction is out of the deck.
  const learnWord = (wordId, day) => [
    { word_id: wordId, direction: 'uk_nl', answered_at: Date.parse(`${day}T10:00:00+01:00`),
      required_correct_after: 2, is_first_answer_ever: true },
    { word_id: wordId, direction: 'uk_nl', answered_at: Date.parse(`${day}T10:05:00+01:00`),
      required_correct_after: null, is_first_answer_ever: false },
    { word_id: wordId, direction: 'nl_uk', answered_at: Date.parse(`${day}T10:10:00+01:00`),
      required_correct_after: null, is_first_answer_ever: false },
  ];
  const facts = calculateFacts({
    deckAnswers: [...learnWord(1, '2026-11-10'), ...learnWord(2, '2026-11-10'), ...learnWord(3, '2026-11-11')],
  });
  assert.equal(facts.most_words_learned_in_day, 2);
});

test('the service lists every medal, locked at 0 for an empty database, with the progress capped at the target', () => {
  const context = createTestContext();
  const { groups, achievements } = context.achievementService.listAchievements();
  assert.equal(groups.length, 13);
  assert.equal(achievements.length, 128);
  assert.ok(achievements.every(achievement => achievement.unlocked === false));
  assert.deepEqual(achievements[0].progress, { current: 0, target: 10 });
  assert.deepEqual(Object.keys(achievements[0]).sort(),
    ['description', 'group', 'icon', 'id', 'progress', 'title', 'unlocked', 'unlocked_at']);
});

test('the service counts learned words per category and the drill answers of the database', () => {
  const context = createTestContext();
  const { added } = context.wordService.createWords(Array.from({ length: 6 }, (_, index) => ({
    nl: `woord${index}`, uk: `слово${index}`, status: 'learned',
  })));
  for (const word of added.slice(0, 5)) context.wordService.updateWord(word.id, { category: 'food' });
  context.database.prepare(`
    INSERT INTO drill_answers (word_id, direction, is_correct, answer, source, answered_at)
    VALUES (@wordId, 'uk_nl', 1, 'x', 'deck', @answeredAt)
  `).run({ wordId: added[0].id, answeredAt: context.clock.now() });
  const { achievements } = context.achievementService.listAchievements();
  const byId = Object.fromEntries(achievements.map(achievement => [achievement.id, achievement]));
  assert.deepEqual(byId['food-5'].progress, { current: 5, target: 5 });
  assert.equal(byId['food-5'].unlocked, true);
  assert.equal(byId['food-10'].unlocked, false);
  assert.deepEqual(byId['words-10'].progress, { current: 6, target: 10 });
  assert.deepEqual(byId['drill-100'].progress, { current: 1, target: 100 });
});

test('the daily goal is the stored setting, 20 without one', () => {
  const context = createTestContext();
  const word = context.wordService.createWord({ nl: 'hallo', uk: 'привіт' });
  for (let index = 0; index < 5; index += 1) {
    context.database.prepare(`
      INSERT INTO drill_answers (word_id, direction, is_correct, answer, source, answered_at)
      VALUES (@wordId, 'uk_nl', 1, 'x', 'deck', @answeredAt)
    `).run({ wordId: word.id, answeredAt: context.clock.now() });
  }
  const goalOne = () => context.achievementService.listAchievements().achievements.find(item => item.id === 'goal-1');
  assert.equal(goalOne().unlocked, false);
  context.database.prepare("INSERT INTO practice_settings (name, value) VALUES ('daily_goal', '5')").run();
  assert.equal(goalOne().unlocked, true);
});

test('the facts count early answers from 5:00 to 8:00 only, not after midnight', () => {
  const facts = calculateFacts({
    activityAnswers: [
      { kind: 'word', answered_at: Date.parse('2026-11-13T01:30:00+01:00') },
      { kind: 'word', answered_at: Date.parse('2026-11-13T06:30:00+01:00') },
    ],
  });
  assert.equal(facts.early_answers, 1);
});

test('a medal once unlocked is saved with its time and stays unlocked when the facts drop', () => {
  const saved = new Map();
  let learnedStatus = 'learned';
  const repository = {
    readFactSources: () => ({
      words: Array.from({ length: 10 }, () => ({ status: learnedStatus, category: null })),
      activityAnswers: [], deckAnswers: [], deckSessionAnswers: [], orderAnswers: [], ruleAnswers: [], dailyGoal: 20,
    }),
    listUnlocks: () => new Map(saved),
    saveUnlocks: (ids, at) => { for (const id of ids) if (!saved.has(id)) saved.set(id, at); },
  };
  let now = Date.parse('2026-11-14T12:00:00+01:00');
  const service = createAchievementService({
    achievementRepository: repository,
    practiceSettings: { readSettings: () => ({ timeZone: TIME_ZONE }) },
    clock: { now: () => now },
  });
  const first = service.listAchievements().achievements.find(medal => medal.id === 'words-10');
  assert.deepEqual([first.unlocked, first.unlocked_at], [true, now]);
  const unlockedAt = now;
  learnedStatus = 'learning';
  now += 3_600_000;
  const later = service.listAchievements().achievements.find(medal => medal.id === 'words-10');
  assert.deepEqual([later.unlocked, later.unlocked_at, later.progress], [true, unlockedAt, { current: 10, target: 10 }]);
});

test('meta medals count the other medals: collected, full groups, every group and topics', () => {
  const saved = new Map();
  const repository = {
    readFactSources: () => ({
      words: [
        ...Array.from({ length: 10 }, () => ({ status: 'learned', category: 'food' })),
        ...Array.from({ length: 5 }, () => ({ status: 'learned', category: 'clothes' })),
        ...Array.from({ length: 5 }, () => ({ status: 'learned', category: 'colours' })),
      ],
      activityAnswers: [], deckAnswers: [], deckSessionAnswers: [], orderAnswers: [], ruleAnswers: [], dailyGoal: 20,
    }),
    listUnlocks: () => new Map(saved),
    saveUnlocks: (ids, at) => { for (const id of ids) if (!saved.has(id)) saved.set(id, at); },
  };
  const service = createAchievementService({
    achievementRepository: repository,
    practiceSettings: { readSettings: () => ({ timeZone: TIME_ZONE }) },
    clock: { now: () => Date.parse('2026-11-14T12:00:00+01:00') },
  });
  const { groups, achievements } = service.listAchievements();
  const medal = id => achievements.find(item => item.id === id);
  assert.equal(groups[0].title, 'Особливі');
  // words-10, food-5, food-10, clothes-5, colours-5: five medals, three topics with five words.
  assert.deepEqual(medal('collected-10').progress, { current: 5, target: 10 });
  assert.equal(medal('topics-3').unlocked, true);
  assert.equal(medal('topics-3').title, '3 теми по 5 слів');
  assert.equal(medal('collected-25').title, '25 досягнень');
  assert.equal(medal('full-groups-1').unlocked, false);
  assert.deepEqual(medal('every-group').progress, { current: 2, target: 12 });
});
