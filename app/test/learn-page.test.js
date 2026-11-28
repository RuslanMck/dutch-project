// The Вчити page (§4) and the navigation of part B: the bottom bar with its hub, the section tabs of Словник and
// Прогрес, Профіль without the achievements card, the exercise screens with their ✕ bar (§5), and the pure helpers
// behind the hub's cards (review time, card lines, the resume strip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildResumeView,
  computeLearnNewPercent,
  estimateReviewMinutes,
  EXERCISE_TABS,
  findNavigationSection,
  formatExerciseTitle,
  formatLearnNewLine,
  formatLearnNewPill,
  formatLearnPhrasesLine,
  formatLearnReviewLine,
  formatLearnStrugglingLine,
  formatResumeLeft,
  formatWaitingWords,
  isExerciseTab,
  isLearnNewDone,
  NAVIGATION_SECTION_FOR_TAB,
  PRACTICE_MODE_TITLES,
  TAB_SUBTITLES,
  TAB_TITLES,
} from '../public/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(here, '..', 'public', name), 'utf8');
const html = read('index.html');
const appSource = read('app.js');
const css = fs.readFileSync(path.join(here, '..', 'storybook', 'styles', 'garden.css'), 'utf8');

// The markup of one top-level section of index.html: from its opening tag to the next one.
function sectionMarkup(id) {
  const start = html.indexOf(`<section id="${id}"`);
  assert.ok(start >= 0, `#${id} is in index.html`);
  const end = html.indexOf('\n    <section', start + 1);
  return html.slice(start, end > start ? end : undefined);
}

// ---------- pure helpers ----------

test('estimateReviewMinutes: 15 seconds a word, at least one minute, nothing when nothing is owed', () => {
  assert.equal(estimateReviewMinutes(0), 0);
  assert.equal(estimateReviewMinutes(1), 1);
  assert.equal(estimateReviewMinutes(4), 1);
  assert.equal(estimateReviewMinutes(6), 2);
  assert.equal(estimateReviewMinutes(40), 10);
  assert.equal(estimateReviewMinutes(13), 3);
});

test('formatWaitingWords agrees the noun and the verb with the count', () => {
  assert.equal(formatWaitingWords(1), '1 слово чекає');
  assert.equal(formatWaitingWords(2), '2 слова чекають');
  assert.equal(formatWaitingWords(5), '5 слів чекають');
  assert.equal(formatWaitingWords(11), '11 слів чекають');
  assert.equal(formatWaitingWords(21), '21 слово чекає');
  assert.equal(formatWaitingWords(0), 'нових слів не залишилося');
});

test('the Нові слова card line: today out of the set, capped at 10; an unknown count is «…»', () => {
  assert.equal(formatLearnNewLine(3, 42), 'Сьогодні 3 з 10 · 42 слова чекають');
  assert.equal(formatLearnNewLine(12, 1), 'Сьогодні 10 з 10 · 1 слово чекає');
  assert.equal(formatLearnNewLine(0, 0), 'Сьогодні 0 з 10 · нових слів не залишилося');
  assert.equal(formatLearnNewLine(NaN, 5), '…');
  assert.equal(formatLearnNewLine(2, undefined), '…');
});

test('the Нові слова bar and pill: a full set reads «Ще 10», never past the bar', () => {
  assert.equal(computeLearnNewPercent(3), 30);
  assert.equal(computeLearnNewPercent(15), 100);
  assert.equal(computeLearnNewPercent(NaN), 0);
  assert.equal(formatLearnNewPill(9), 'Почати');
  assert.equal(formatLearnNewPill(10), 'Ще 10');
});

test('the daily set size comes from the server (set_size); 10 is the fallback', () => {
  assert.equal(formatLearnNewLine(3, 42, 12), 'Сьогодні 3 з 12 · 42 слова чекають');
  assert.equal(formatLearnNewLine(12, 1, 12), 'Сьогодні 12 з 12 · 1 слово чекає');
  assert.equal(formatLearnNewLine(3, 42, null), 'Сьогодні 3 з 10 · 42 слова чекають');
  assert.equal(formatLearnNewLine(3, 42, 0), 'Сьогодні 3 з 10 · 42 слова чекають');
  assert.equal(formatLearnNewPill(12, 12), 'Ще 12');
  assert.equal(formatLearnNewPill(9, 12), 'Почати');
  assert.equal(computeLearnNewPercent(6, 12), 50);
  assert.equal(isLearnNewDone(10, 12), false);
  assert.equal(isLearnNewDone(12, 12), true);
  assert.equal(isLearnNewDone(NaN, 10), false);
});

test('the Запам\'ятовування card line: the words, the minutes, or «all repeated» when nothing is owed', () => {
  assert.equal(formatLearnReviewLine(0), 'На сьогодні все повторено');
  assert.equal(formatLearnReviewLine(1), '1 слово на сьогодні · близько 1 хв');
  assert.equal(formatLearnReviewLine(40), '40 слів на сьогодні · близько 10 хв');
  assert.equal(formatLearnReviewLine(null), '…');
});

test('the tile lines: Важкі слова counts its words, Фрази shows today\'s set or the plain name', () => {
  assert.equal(formatLearnStrugglingLine(0), 'Немає важких слів');
  assert.equal(formatLearnStrugglingLine(22), '22 слова');
  assert.equal(formatLearnStrugglingLine(null), '…');
  assert.equal(formatLearnPhrasesLine(3), '3 на сьогодні');
  assert.equal(formatLearnPhrasesLine(0), 'Фрази з діалогів');
  assert.equal(formatLearnPhrasesLine(undefined), 'Фрази з діалогів');
});

test('the resume strip: nothing when no set has answers and words left; a drill wins over the daily set', () => {
  assert.equal(buildResumeView(), null);
  assert.equal(buildResumeView({ fsrs: { kind: 'new', answered: false, left: 8 } }), null);
  assert.equal(buildResumeView({ fsrs: { kind: 'new', answered: true, left: 0 } }), null);
  assert.deepEqual(buildResumeView({ fsrs: { kind: 'new', answered: true, left: 6 } }),
    { mode: 'fsrs', title: 'Продовжити: Нові слова', line: 'Залишилось 6' });
  assert.deepEqual(buildResumeView({ fsrs: { kind: 'review', answered: true, left: 3 } }),
    { mode: 'review', title: 'Продовжити: Запам\'ятовування', line: 'Залишилось 3' });
  assert.deepEqual(buildResumeView({ custom: { left: 4 }, fsrs: { kind: 'new', answered: true, left: 6 } }),
    { mode: 'custom', title: 'Продовжити: тренування', line: 'Залишилось 4' });
  assert.equal(formatResumeLeft(NaN), '');
});

test('the exercise bar: the exercise tabs, the practice mode names and the tab titles', () => {
  for (const tab of ['practice', 'cards', 'phrases', 'word-order', 'rule-quiz', 'known-check']) {
    assert.ok(EXERCISE_TABS.includes(tab), `${tab} is an exercise`);
    assert.equal(isExerciseTab(tab), true);
  }
  for (const tab of ['home', 'learn', 'decks', 'table', 'stats', 'profile']) assert.equal(isExerciseTab(tab), false, tab);
  assert.equal(formatExerciseTitle('practice', 'fsrs'), 'Нові слова');
  assert.equal(formatExerciseTitle('practice', 'review'), 'Запам\'ятовування');
  assert.equal(formatExerciseTitle('practice', 'art'), 'Артикль');
  assert.equal(formatExerciseTitle('practice', 'struggling'), 'Важкі слова');
  assert.equal(formatExerciseTitle('practice', 'custom'), 'Тренування');
  assert.equal(formatExerciseTitle('practice', 'unknown'), 'Практика');
  assert.equal(PRACTICE_MODE_TITLES.review, 'Запам\'ятовування');
  assert.equal(formatExerciseTitle('known-check', 'fsrs'), 'Що я вже знаю');
});

test('the bottom bar sections: Словник, Вчити, Прогрес and Профіль group their tabs; Головна is alone', () => {
  assert.equal(TAB_TITLES.learn, 'Вчити');
  assert.equal(TAB_SUBTITLES.learn, 'Усі вправи в одному місці');
  assert.equal(TAB_TITLES.stats, 'Прогрес');
  for (const tab of ['table', 'rules', 'texts']) assert.equal(findNavigationSection(tab), 'dictionary', tab);
  for (const tab of ['learn', 'practice', 'cards', 'decks', 'phrases', 'word-order', 'rule-quiz', 'known-check']) {
    assert.equal(findNavigationSection(tab), 'learn', tab);
  }
  for (const tab of ['stats', 'week', 'achievements']) assert.equal(findNavigationSection(tab), 'progress', tab);
  for (const tab of ['profile', 'settings']) assert.equal(findNavigationSection(tab), 'profile', tab);
  assert.equal(findNavigationSection('home'), 'home');
  assert.equal(NAVIGATION_SECTION_FOR_TAB.decks, 'learn');
  for (const section of new Set(Object.values(NAVIGATION_SECTION_FOR_TAB))) {
    assert.ok(['home', 'dictionary', 'learn', 'progress', 'profile'].includes(section), section);
  }
});

// ---------- the markup ----------

test('the bottom bar: Головна, Словник, the Вчити hub in the middle, Прогрес, Профіль; no play button', () => {
  const nav = html.slice(html.indexOf('<nav id="bottom-nav"'), html.indexOf('</nav>', html.indexOf('<nav id="bottom-nav"')));
  const items = [...nav.matchAll(/data-tab="([\w-]+)" data-nav="([\w-]+)"/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(items, [['home', 'home'], ['table', 'dictionary'], ['learn', 'learn'], ['stats', 'progress'], ['profile', 'profile']]);
  assert.match(nav, /<button class="bottom-nav__hub" type="button" data-tab="learn" data-nav="learn">[\s\S]*?<span class="bottom-nav__disc">[\s\S]*?<span>Вчити<\/span><\/button>/);
  assert.doesNotMatch(html, /bottom-nav__play|data-nav="practice"|Колоди<\/span>/);
  assert.match(nav, /<span>Словник<\/span>/);
  assert.match(nav, /<span>Прогрес<\/span>/);
});

test('Головна keeps its header and goal card, has the Далі card in place of the search and the continue card, and loses the practice tiles', () => {
  // The search moved to Словник's own field; the continue card's job is the Далі card (home-page.test.js).
  const home = sectionMarkup('tab-home');
  assert.match(home, /id="home-goal"/);
  assert.match(home, /id="home-next-button"/);
  assert.doesNotMatch(home, /home-search-form|home-continue-button|practice-tile|home-section-title|Тренування</);
  assert.doesNotMatch(html, /home-tile-/);
});

test('Вчити: the resume strip, the daily cards, the word and sentence tiles, and the deck strip', () => {
  const learn = sectionMarkup('tab-learn');
  assert.match(learn, /data-tab="learn"/);
  for (const id of ['learn-resume', 'learn-new', 'learn-review', 'learn-new-line', 'learn-new-fill', 'learn-new-pill',
    'learn-new-done', 'learn-review-line', 'learn-review-done', 'learn-article', 'learn-struggling', 'learn-struggling-line',
    'learn-phrases-line', 'learn-decks']) {
    assert.match(learn, new RegExp(`id="${id}"`), `#${id}`);
  }
  assert.match(learn, /<span class="learn-card__name">Нові слова<\/span>/);
  assert.match(learn, /<span class="learn-card__name">Запам'ятовування<\/span>/);
  assert.match(learn, /<span class="learn-tile__name">Артикль<\/span>\s*<span class="learn-tile__line">de чи het<\/span>/);
  assert.match(learn, /<button class="learn-tile" type="button" data-tab="known-check">/);
  assert.match(learn, /<button class="learn-tile" type="button" data-tab="word-order">/);
  assert.match(learn, /<button class="learn-tile" type="button" data-tab="rule-quiz">/);
  assert.match(learn, /<button class="learn-tile" type="button" data-tab="phrases">/);
  assert.match(learn, /<button class="learn-section-link" type="button" data-tab="decks" aria-label="Усі колоди">Усі<\/button>/);
  // The counts are drawn by app.js, so the markup holds no number of its own.
  assert.doesNotMatch(learn, /undefined/);
});

test('Словник and Прогрес have their section tabs; the tabs point at the six pages', () => {
  const pages = [
    ['tab-table', 'Розділи словника', [['table', 'Слова'], ['rules', 'Правила'], ['texts', 'Тексти']]],
    ['tab-rules', 'Розділи словника', [['table', 'Слова'], ['rules', 'Правила'], ['texts', 'Тексти']]],
    ['tab-texts', 'Розділи словника', [['table', 'Слова'], ['rules', 'Правила'], ['texts', 'Тексти']]],
    ['tab-stats', 'Розділи прогресу', [['stats', 'Статистика'], ['week', 'Тиждень'], ['achievements', 'Досягнення']]],
    ['tab-week', 'Розділи прогресу', [['stats', 'Статистика'], ['week', 'Тиждень'], ['achievements', 'Досягнення']]],
    ['tab-achievements', 'Розділи прогресу', [['stats', 'Статистика'], ['week', 'Тиждень'], ['achievements', 'Досягнення']]],
  ];
  for (const [id, label, links] of pages) {
    const markup = sectionMarkup(id);
    const nav = markup.match(/<nav class="section-tabs[^"]*" aria-label="([^"]+)">([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${id} has the section tabs`);
    assert.equal(nav[1], label);
    const buttons = [...nav[2].matchAll(/<button type="button" data-tab="([\w-]+)">([^<]+)<\/button>/g)].map(match => [match[1], match[2]]);
    assert.deepEqual(buttons, links, id);
  }
  assert.match(appSource, /for \(const link of document\.querySelectorAll\('\.section-tabs \[data-tab\]'\)\)/);
  assert.match(appSource, /link\.setAttribute\('aria-current', 'page'\)/);
});

test('the exercise bar: ✕ with its label, and the title that takes the focus', () => {
  assert.match(html, /<header id="exercise-bar" class="exercise-bar">/);
  assert.match(html, /<button id="exercise-close" class="icon-button" type="button" aria-label="Закрити вправу">/);
  assert.match(html, /<h1 id="exercise-title" class="exercise-bar__title" tabindex="-1"><\/h1>/);
  assert.match(appSource, /\$\('exercise-close'\)\.addEventListener\('click', closeExercise\);/);
  assert.match(appSource, /else if \(isExerciseTab\(ui\.tab\)\) \$\('exercise-title'\)\.focus\(options\);/);
  assert.match(appSource, /document\.body\.classList\.toggle\('is-exercise', isExerciseTab\(ui\.tab\)\);/);
  assert.match(css, /body\.is-exercise #top-header,\s*body\.is-exercise #bottom-nav \{ display: none; \}/);
  assert.match(css, /body\.is-exercise \.exercise-bar \{ display: flex; \}/);
});

test('✕ goes back to Вчити at the scroll position it had: the position is kept when Вчити is left', () => {
  const close = appSource.slice(appSource.indexOf('function closeExercise() {'), appSource.indexOf('\n}\n', appSource.indexOf('function closeExercise() {')));
  assert.match(close, /const scrollY = ui\.learnScrollY;/);
  assert.match(close, /focusTabHeading\(\{ preventScroll: true \}\);\s*window\.scrollTo\(0, scrollY\);/);
  assert.match(appSource, /if \(previousTab === 'learn' && nextTab !== 'learn'\) ui\.learnScrollY = window\.scrollY;/);
});

test('an exercise entered from elsewhere than Вчити resets the saved Вчити scroll, so ✕ lands at the top', () => {
  assert.match(appSource, /if \(isExerciseTab\(nextTab\) && previousTab !== 'learn' && !isExerciseTab\(previousTab\)\) ui\.learnScrollY = 0;/);
});

// The body of one top-level function of app.js (from its header to the closing brace at column 0).
function appFunction(header) {
  const start = appSource.indexOf(header);
  assert.ok(start >= 0, `${header} is in app.js`);
  return appSource.slice(start, appSource.indexOf('\n}\n', start) + 3);
}

test('the resume strip reopens the drill in its own mode; the daily sets keep their mode', () => {
  const resume = appFunction('function resumeLearnPractice() {');
  assert.match(resume, /if \(view\.mode === 'custom'\) \{[\s\S]*?ui\.practice\.mode = ui\.custom\.mode;\s*showTab\('practice'\);/);
  assert.match(resume, /else openFsrsPractice\(view\.mode\);/);
});

test('the exercises opened from a button move focus to their title after the switch', () => {
  for (const header of ['function openFsrsPractice(mode) {', 'function openArticlePractice() {', 'function handleHomeStrugglingTile() {',
    'function resumeLearnPractice() {', 'function handleHomeNextClick(event) {', 'function handleLearnDecksClick(event) {']) {
    assert.match(appFunction(header), /focusTabHeading\(/, `${header} moves focus`);
  }
  assert.match(appFunction('async function practiceDeck(deck) {'), /source: 'deck' \}\);\s*focusTabHeading\(\);/);
});

test('a drill started from Вчити or Головна returns to Вчити; the Колоди page keeps its own return', () => {
  assert.match(appFunction('function handleHomeStrugglingTile() {'), /startStrugglingDrill\('learn'\);/);
  assert.match(appFunction('async function startStrugglingDrill(returnTo = \'practice\') {'), /returnTo, mode: 'struggling'/);
  assert.match(appFunction('function handleStrugglingButtonClick() {'), /startStrugglingDrill\('practice'\);/);
  assert.match(appFunction('async function practiceDeck(deck) {'), /const returnTo = startTab === 'learn' \? 'learn' : 'decks';[\s\S]*?startDeckSet\([^\n]*\{ returnTo, source: 'deck' \}\)/);
  assert.match(appFunction('function leaveCustomDrill() {'), /if \(name === 'learn'\) \{\s*showTab\('learn'\);/);
  assert.match(appFunction('function handleRoundFinishClick() {'), /showTab\('learn'\);/);
});

test('the learn page wiring: the return to Вчити and the Головна loader keep the newest reply', () => {
  assert.match(appFunction('async function loadHomeOverview() {'), /const request = \+\+homeOverviewRequest;/);
  assert.match(appFunction('async function loadHomeOverview() {'), /if \(request !== homeOverviewRequest\) return;/);
  assert.match(appFunction('async function loadHomeOverview() {'), /if \(ui\.tab === 'home'\) renderHome\(\);/);
  assert.match(appSource, /\['home', 'achievements'\]\.includes\(ui\.tab\)\) loadAchievements\(\);/);
});

test('the practice page has no mode block; the mode select stays in the DOM, hidden, for app.js', () => {
  assert.match(html, /<select id="practice-mode" hidden>/);
  assert.doesNotMatch(html, /practice-mode-chip|practice-mode-hint|practice-known-check-link|hint-field/);
  assert.doesNotMatch(appSource, /practice-mode-chip|isModePickerOpen/);
});

test('Профіль: no achievements card; the menu has Налаштування only; Вийти has its icon', () => {
  const profile = sectionMarkup('tab-profile');
  assert.doesNotMatch(html, /id="profile-achievements/);
  assert.doesNotMatch(profile, /data-tab="(table|rules|texts|achievements)"/);
  assert.match(profile, /<button class="profile-menu__link" type="button" data-tab="settings"><svg[^>]*>[\s\S]*?<span>Налаштування<\/span><\/button>/);
  assert.match(profile, /<button class="ghost profile-logout__button" type="submit"><svg[^>]*>[\s\S]*?<\/svg>Вийти<\/button>/);
  assert.doesNotMatch(appSource, /renderProfileAchievements|profile-achievements/);
});

test('the Вчити ids and the exercise ids in app.js all exist in index.html', () => {
  const used = new Set([...appSource.matchAll(/\$\('((?:learn|exercise)-[\w-]+)'\)/g)].map(match => match[1]));
  assert.ok(used.size >= 14, 'the hub and the exercise bar are wired');
  for (const id of used) assert.match(html, new RegExp(`id="${id}"`), `index.html has #${id}`);
});

test('app.js: the learn tab is in TABS and renders the hub; the old home tile listeners are gone', () => {
  assert.match(appSource, /const TABS = \['home', 'learn', /);
  assert.match(appSource, /learn: renderLearn,/);
  assert.match(appSource, /const NAVIGATION_ORDER = \['home', 'dictionary', 'learn', 'progress', 'profile'\];/);
  assert.match(appSource, /if \(ui\.tab === 'learn'\) \{ loadHomeStrugglingCount\(\); loadHomePracticeCounts\(\); loadDeckList\(\); \}/);
  assert.match(appSource, /\$\('learn-new'\)\.addEventListener\('click', \(\) => openFsrsPractice\('fsrs'\)\);/);
  assert.match(appSource, /\$\('learn-review'\)\.addEventListener\('click', \(\) => openFsrsPractice\('review'\)\);/);
  assert.match(appSource, /\$\('learn-article'\)\.addEventListener\('click', openArticlePractice\);/);
  assert.match(appSource, /\$\('learn-struggling'\)\.addEventListener\('click', handleHomeStrugglingTile\);/);
});

test('the Вчити styles use garden tokens and the light fills of §0 for the daily cards', () => {
  assert.match(css, /\.learn-card--new \{ background: var\(--garden-right-soft\); \}/);
  assert.match(css, /\.learn-card--review \{ background: var\(--garden-peach\); \}/);
  assert.match(css, /\.bottom-nav__hub\[aria-current="page"\] \.bottom-nav__disc \{ outline: 2px solid var\(--garden-ink\); outline-offset: 0; \}/);
  assert.match(css, /@media \(max-width: 339px\) \{ \.learn-tiles \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \} \}/);
  // Every new block takes its colours from the tokens: no raw colour in the learn and exercise rules.
  const block = css.slice(css.indexOf('/* Вчити (§4)'));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,6}\b|rgba?\(/);
});

test('a page sliding in never widens the screen: .app clips the side overflow, so the fixed bottom bar stays put', () => {
  const appRule = css.match(/^\.app \{[^}]*\}/m)[0];
  assert.match(appRule, /overflow-x: clip;/);
  assert.match(css, /\.tab-enter \{ animation: motion-enter/);
});
