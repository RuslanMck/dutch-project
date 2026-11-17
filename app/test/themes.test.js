// Tests for the colour themes picked in Налаштування: the token data, its contrast, the page and the startup script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickTheme, DEFAULT_THEME, TAB_TITLES, findNavigationSection } from '../public/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.join(here, '..');
const read = name => fs.readFileSync(path.join(appDirectory, name), 'utf8');
const colorThemes = JSON.parse(read('storybook/tokens/tokens.json')).colorThemes;
const themes = Object.entries(colorThemes.list);
const html = read('public/index.html');

// WCAG 2.x contrast.
const toLinear = channel => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

// The text-on-ground pairs the token usage notes allow (storybook-maintenance skill, rule 7).
const TEXT_PAIRS = {
  'garden-ink': ['garden-paper', 'garden-raised', 'garden-tint', 'garden-sand', 'garden-peach', 'garden-blush',
    'garden-periwinkle', 'garden-mustard', 'garden-right-soft'],
  'garden-on-primary': ['garden-primary'],
  'garden-ink-soft': ['garden-paper', 'garden-raised', 'garden-tint', 'garden-peach', 'garden-blush'],
  'garden-rust': ['garden-paper', 'garden-raised', 'garden-tint', 'garden-blush'],
  'garden-forest': ['garden-paper', 'garden-raised', 'garden-tint', 'garden-blush', 'garden-peach', 'garden-right-soft'],
};

test('the default theme exists and every theme lists the same colours', () => {
  assert.equal(colorThemes.default, DEFAULT_THEME);
  assert.ok(colorThemes.list[DEFAULT_THEME]);
  const names = Object.keys(colorThemes.list[DEFAULT_THEME].values).sort();
  for (const [id, theme] of themes) {
    assert.match(id, /^[a-z-]+$/, id);
    assert.deepEqual(Object.keys(theme.values).sort(), names, id);
    for (const value of Object.values(theme.values)) assert.match(value, /^#[0-9a-f]{6}$/, id);
  }
});

test('every theme keeps text readable: 4.5:1 or more on each allowed ground', () => {
  for (const [id, theme] of themes) {
    for (const [text, grounds] of Object.entries(TEXT_PAIRS)) {
      for (const ground of grounds) {
        const ratio = contrast(theme.values[text], theme.values[ground]);
        assert.ok(ratio >= 4.5, `${id}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('Сад repeats the base token values', () => {
  const baseTokens = JSON.parse(read('storybook/tokens/tokens.json')).color.tokens;
  for (const [name, value] of Object.entries(colorThemes.list[DEFAULT_THEME].values)) {
    assert.equal(baseTokens.find(token => token.name === name).value.light, value, name);
  }
});

test('Налаштування offers every theme, in the token order, with its name, and nothing else', () => {
  const offered = [...html.matchAll(/<input class="theme-option__input" type="radio" name="theme" value="([a-z-]+)">/g)]
    .map(match => match[1]);
  assert.deepEqual(offered, themes.map(([id]) => id));
  for (const [id, theme] of themes) {
    assert.ok(html.includes(`<label class="theme-option" data-theme="${id}">`), id);
    assert.ok(html.includes(`<span class="theme-option__name">${theme.name}</span>`), id);
  }
});

test('app.css carries one block per theme', () => {
  const css = read('public/app.css');
  for (const [id] of themes) assert.ok(css.includes(`[data-theme="${id}"] {`), id);
});

test('the Налаштування tab: title, Профіль section and its link', () => {
  assert.equal(TAB_TITLES.settings, 'Налаштування');
  assert.equal(findNavigationSection('settings'), 'profile');
  assert.match(html, /<button class="profile-menu__link" type="button" data-tab="settings">/);
  assert.match(read('public/app.js'), /'known-check', 'settings'\]/);
});

test('pickTheme keeps a known saved theme and falls back to Сад otherwise', () => {
  const names = themes.map(([id]) => id);
  assert.equal(pickTheme('cinnamon-oat', names), 'cinnamon-oat');
  assert.equal(pickTheme(null, names), DEFAULT_THEME);
  assert.equal(pickTheme('purple', names), DEFAULT_THEME);
});

test('theme.js loads in the <head> of both pages, works offline and before sign-in', () => {
  for (const page of ['public/index.html', 'public/login.html']) {
    const head = read(page).split('</head>')[0];
    assert.ok(head.includes('<script src="theme.js"></script>'), page);
    assert.ok(head.indexOf('app.css') < head.indexOf('theme.js'), page);
  }
  assert.match(read('public/sw.js'), /'\/theme\.js',/);
  assert.match(read('src/server/create-application.js'), /'theme\.js'/);
});

test('theme.js puts the saved theme on <html> and ignores a broken value', () => {
  const source = read('public/theme.js');
  const run = saved => {
    const documentElement = { dataset: {} };
    new Function('localStorage', 'document', source)({ getItem: () => saved }, { documentElement });
    return documentElement.dataset.theme;
  };
  assert.equal(run('moss-pumpkin'), 'moss-pumpkin');
  assert.equal(run(null), undefined);
  assert.equal(run('"><script>'), undefined);
});
