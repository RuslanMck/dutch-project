// Medal icons (docs/WEEK_GOAL_CALENDAR_ACHIEVEMENTS.md §5): small 24×24 strokes in the style of the bottom-bar icons.
// The icon names are the ones the server sends in each achievement; the category ids name the category medals.
// The parts are plain data, so the tests can check every name without a DOM. drawAchievementIcon builds the SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PARTS = Object.freeze({
  trophy: [
    ['path', { d: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5' }],
  ],
  crown: [['path', { d: 'M4 18h16M5 18L4 7l5 4 3-6 3 6 5-4-1 11' }]],
  compass: [
    ['circle', { cx: '12', cy: '12', r: '8.5' }],
    ['path', { d: 'M15.5 8.5l-2 5-5 2 2-5z' }],
  ],
  layers: [['path', { d: 'M12 4l9 4.5-9 4.5-9-4.5zM3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5' }]],
  star: [['path', { d: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z' }]],
  flame: [['path', { d: 'M12 21a6 6 0 0 0 6-6c0-4-3-5-4-9-2 2-2 4-2 4-1-1-2-2-2-4-2 2-4 5-4 9a6 6 0 0 0 6 6z' }]],
  calendar: [
    ['rect', { x: '3', y: '5', width: '18', height: '16', rx: '2' }],
    ['path', { d: 'M3 10h18M8 3v4M16 3v4' }],
  ],
  check: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M8 12.5l2.5 2.5L16 9.5' }],
  ],
  sentence: [['path', { d: 'M4 6h16M4 12h10M4 18h13' }]],
  rule: [
    ['rect', { x: '3', y: '8', width: '18', height: '8', rx: '1.5' }],
    ['path', { d: 'M7 8v3M11 8v4M15 8v3M19 8v3' }],
  ],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }],
  ],
  moon: [['path', { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }]],
  weekend: [
    ['path', { d: 'M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4H3z' }],
    ['path', { d: 'M5 19v2M19 19v2' }],
  ],
  return: [['path', { d: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4' }]],
  bolt: [['path', { d: 'M13 2L4 14h7l-1 8 9-12h-7z' }]],
  leaf: [['path', { d: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8' }]],
  target: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['circle', { cx: '12', cy: '12', r: '5' }],
    ['circle', { cx: '12', cy: '12', r: '1' }],
  ],
  // The category medals: one per category id of WORD_CATEGORIES.
  food: [
    ['path', { d: 'M6 3v6a2 2 0 0 0 4 0V3M8 3v18' }],
    ['path', { d: 'M16 21V3c-2 1-3 4-3 8h3' }],
  ],
  home: [
    ['path', { d: 'M3 11l9-8 9 8M5 10v10h14V10' }],
    ['path', { d: 'M10 20v-6h4v6' }],
  ],
  clothes: [['path', { d: 'M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3c-1 2-7 2-8 0z' }]],
  colours: [
    ['path', { d: 'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-2 2.5-2H18a3 3 0 0 0 3-3c0-4.4-4-8.5-9-8.5z' }],
    ['circle', { cx: '7.5', cy: '10.5', r: '1' }],
    ['circle', { cx: '10.5', cy: '7', r: '1' }],
    ['circle', { cx: '15', cy: '7.5', r: '1' }],
  ],
  numbers: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  people: [
    ['circle', { cx: '9', cy: '8', r: '3.5' }],
    ['path', { d: 'M3 20c.8-3.5 3.2-5 6-5s5.2 1.5 6 5' }],
    ['circle', { cx: '17', cy: '9', r: '2.5' }],
    ['path', { d: 'M16 14.5c3 0 5 1.5 5.5 4.5' }],
  ],
  body: [['path', { d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' }]],
  city: [
    ['rect', { x: '5', y: '3', width: '14', height: '15', rx: '3' }],
    ['path', { d: 'M5 10h14M8 18v3M16 18v3' }],
    ['circle', { cx: '9', cy: '14.5', r: '1' }],
    ['circle', { cx: '15', cy: '14.5', r: '1' }],
  ],
  work: [['path', { d: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3' }]],
  nature: [
    ['path', { d: 'M4 20C4 12 8 8 15 7c0 7-4 12-11 13z' }],
    ['circle', { cx: '17', cy: '6', r: '2.5' }],
  ],
  leisure: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18' }],
  ],
  feelings: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M8.5 14a4 4 0 0 0 7 0' }],
    ['circle', { cx: '9', cy: '10', r: '.6' }],
    ['circle', { cx: '15', cy: '10', r: '.6' }],
  ],
  actions: [['path', { d: 'M4 12h15M13 6l6 6-6 6' }]],
  talk: [['path', { d: 'M4 5h16v11H9l-5 4z' }]],
  other: [
    ['circle', { cx: '6', cy: '12', r: '1.5' }],
    ['circle', { cx: '12', cy: '12', r: '1.5' }],
    ['circle', { cx: '18', cy: '12', r: '1.5' }],
  ],
});

// Every icon name the page can draw.
export const ACHIEVEMENT_ICON_NAMES = Object.freeze(Object.keys(ICON_PARTS));

// The icon for a medal; an unknown name gets the star.
export function drawAchievementIcon(name) {
  const parts = ICON_PARTS[name] ?? ICON_PARTS.star;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'achievement-icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attributes] of parts) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [attribute, value] of Object.entries(attributes)) part.setAttribute(attribute, value);
    svg.append(part);
  }
  return svg;
}

// The parts of one icon, for the tests.
export function achievementIconParts(name) {
  return ICON_PARTS[name];
}
