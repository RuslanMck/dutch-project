// Motion helpers (docs/MOTION.md): short animations on top of what app.js renders. They hold no app state and never
// block input. With prefers-reduced-motion the CSS turns animations off, and the scripted ones here are skipped.

const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
const SVG_NS = 'http://www.w3.org/2000/svg';
const PETAL_COLOURS = ['#3e5240', '#e3922a', '#f3c7a7', '#cca967', '#6a5d2e', '#9b411c'];

export function isMotionReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Plays a CSS animation class again, even when the element already has it. The class goes away once the animation
// is over: an element that leaves display:none restarts its animations, so a class left on would replay them each
// time its tab or form is shown again.
const ONE_SHOT_MS = 1500;
const classTimers = new WeakMap();
export function replayClass(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  const timers = classTimers.get(element) ?? new Map();
  clearTimeout(timers.get(className));
  timers.set(className, setTimeout(() => element.classList.remove(className), ONE_SHOT_MS));
  classTimers.set(element, timers);
}

function makeSvg(viewBox, className, parts) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributes] of parts) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, value);
    svg.append(part);
  }
  return svg;
}

// The small sprout that grows next to «✓ Правильно».
// Once grown it stays still, so showing the message again does not grow it anew.
export function makeSprout() {
  const sprout = makeSvg('0 0 30 30', 'sprout', [
    ['path', { class: 'sprout__stem', d: 'M15 28 V12', stroke: '#3e5240', 'stroke-width': '2.5', 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { class: 'sprout__leaf sprout__leaf--left', d: 'M15 16 C9 16 6 12 6 8 C11 8 15 11 15 16z', fill: '#3e5240' }],
    ['path', { class: 'sprout__leaf sprout__leaf--right', d: 'M15 13 C20 13 24 10 24 5 C19 5 15 8 15 13z', fill: '#6a5d2e' }],
  ]);
  setTimeout(() => sprout.classList.add('sprout--grown'), ONE_SHOT_MS);
  return sprout;
}

// The sprout growing in a pot, for the long loading of the rule exercises.
export function makeGrowingPot() {
  const svg = makeSvg('0 0 64 64', 'growing-pot', [
    ['path', { d: 'M18 44 h28 l-3 14 a3 3 0 0 1-3 2 H24 a3 3 0 0 1-3-2z', fill: '#cca967' }],
    ['rect', { x: '15', y: '41', width: '34', height: '6', rx: '3', fill: '#9b411c' }],
  ]);
  const plant = document.createElementNS(SVG_NS, 'g');
  plant.setAttribute('class', 'growing-pot__plant');
  for (const [className, d, fill] of [
    ['', 'M32 42 V22', ''],
    ['growing-pot__leaf growing-pot__leaf--left', 'M32 32 C24 32 19 27 19 21 C26 21 32 25 32 32z', '#3e5240'],
    ['growing-pot__leaf growing-pot__leaf--right', 'M32 27 C39 27 45 23 45 16 C38 16 32 20 32 27z', '#6a5d2e'],
  ]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (className) path.setAttribute('class', className);
    if (fill) path.setAttribute('fill', fill);
    else {
      path.setAttribute('stroke', '#3e5240');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round');
    }
    plant.append(path);
  }
  svg.prepend(plant);
  return svg;
}

// Answer feedback on an input: green when right, red and a short shake when wrong, plain when not checked.
// isNew: the feedback was just given (the shake plays only then, not on a re-render).
export function showInputResult(input, result, isNew) {
  if (!input) return;
  input.classList.toggle('input--right', result === 'right');
  input.classList.toggle('input--wrong', result === 'wrong');
  if (result === 'wrong' && isNew) replayClass(input, 'shake');
}

// Rects of the word tiles on screen, by pile index, before a render moves them.
export function snapshotTiles(containers) {
  const rects = new Map();
  for (const container of containers) {
    for (const tile of container.querySelectorAll('[data-pile-index]')) {
      rects.set(tile.dataset.pileIndex, tile.getBoundingClientRect());
    }
  }
  return rects;
}

// After the render: every tile that moved glides from where it was (FLIP).
export function playTileMoves(rects, containers) {
  if (isMotionReduced() || !rects.size) return;
  for (const container of containers) {
    for (const tile of container.querySelectorAll('[data-pile-index]')) {
      const first = rects.get(tile.dataset.pileIndex);
      if (!first) continue;
      const last = tile.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 360, easing: SPRING });
    }
  }
}

// The right answer bounces tile by tile, like a wave.
export function waveTiles(container) {
  [...container.children].forEach((tile, position) => {
    tile.style.animationDelay = `${position * 70}ms`;
    replayClass(tile, 'wave');
  });
}

// Counts the first number of each element up from 0 (the rest of its text stays). A new count-up or stopCountUp on
// an element ends the one running on it, so it never writes old text over new.
const countUpRuns = new WeakMap();
export function stopCountUp(elements) {
  for (const element of elements) countUpRuns.delete(element);
}

export function countUpNumbers(elements, duration = 900) {
  stopCountUp(elements);
  if (isMotionReduced()) return;
  const targets = [...elements].map(element => {
    const match = element.textContent.match(/\d+/);
    return match ? { element, text: element.textContent, match } : null;
  }).filter(Boolean);
  if (!targets.length) return;
  const run = {};
  for (const { element } of targets) countUpRuns.set(element, run);
  const start = performance.now();
  const tick = now => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const liveTargets = targets.filter(({ element }) => countUpRuns.get(element) === run);
    if (!liveTargets.length) return;
    for (const { element, text, match } of liveTargets) {
      const value = Math.round(Number(match[0]) * eased);
      element.textContent = text.slice(0, match.index) + value + text.slice(match.index + match[0].length);
    }
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Petals of the garden colours fall over the holder (its position must not be static).
export function dropPetals(holder, count) {
  if (isMotionReduced() || !holder || count <= 0) return;
  const width = holder.clientWidth;
  const height = Math.max(holder.clientHeight, 200);
  for (let index = 0; index < count; index += 1) {
    const petal = document.createElement('span');
    petal.className = 'petal';
    petal.setAttribute('aria-hidden', 'true');
    petal.style.left = `${Math.random() * width}px`;
    petal.style.background = PETAL_COLOURS[index % PETAL_COLOURS.length];
    holder.append(petal);
    const drift = (Math.random() - 0.5) * 120;
    const spin = (Math.random() - 0.5) * 720;
    const animation = petal.animate([
      { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
      { transform: `translate(${drift}px, ${height + 30}px) rotate(${spin}deg)`, opacity: 0.85 },
    ], { duration: 1400 + Math.random() * 1000, delay: Math.random() * 400, easing: 'cubic-bezier(.3, .6, .6, 1)' });
    animation.onfinish = () => petal.remove();
    animation.oncancel = () => petal.remove();
  }
}

// A finish screen celebrates once each time it appears, not on every re-render while it stays on screen.
const shownSummaries = new WeakSet();
export function celebrateWhenShown(section, { petalCount = 0, numbers = [] } = {}) {
  if (!section) return;
  if (section.hidden) {
    shownSummaries.delete(section);
    return;
  }
  if (shownSummaries.has(section)) return;
  shownSummaries.add(section);
  countUpNumbers(numbers);
  dropPetals(section, petalCount);
}

// Turns an element over in 3D: to 90°, swap() changes the side, back to 0°. isTurning tells a second tap to wait.
const turningElements = new WeakSet();
export function isTurning(element) {
  return turningElements.has(element);
}

export function turnOver(element, swap) {
  if (isMotionReduced() || !element.animate) {
    swap();
    return;
  }
  turningElements.add(element);
  const half = element.animate([{ transform: 'perspective(900px) rotateY(0)' }, { transform: 'perspective(900px) rotateY(90deg)' }],
    { duration: 140, easing: 'ease-in' });
  half.onfinish = () => {
    swap();
    const back = element.animate([{ transform: 'perspective(900px) rotateY(-90deg)' }, { transform: 'perspective(900px) rotateY(0)' }],
      { duration: 320, easing: SPRING });
    back.onfinish = back.oncancel = () => turningElements.delete(element);
  };
  half.oncancel = () => turningElements.delete(element);
}

// The digits of a number that roll like a meter. from: the value shown before (rolls to value), or null (no roll).
export function renderOdometer(holder, value, from) {
  const digits = String(value).split('');
  const spoken = document.createElement('span');
  spoken.className = 'sr-only';
  spoken.textContent = String(value);
  const startDigits = from == null ? digits : String(from).padStart(digits.length, '0').slice(-digits.length).split('');
  holder.replaceChildren(...digits.map(() => {
    const digit = document.createElement('span');
    digit.className = 'odometer__digit';
    digit.setAttribute('aria-hidden', 'true');
    const strip = document.createElement('span');
    strip.className = 'odometer__strip';
    for (let n = 0; n <= 9; n += 1) {
      const cell = document.createElement('span');
      cell.textContent = String(n);
      strip.append(cell);
    }
    digit.append(strip);
    return digit;
  }), spoken);
  const strips = [...holder.querySelectorAll('.odometer__strip')];
  strips.forEach((strip, index) => { strip.style.transform = `translateY(-${Number(startDigits[index])}em)`; });
  if (from == null || isMotionReduced()) {
    strips.forEach((strip, index) => { strip.style.transform = `translateY(-${Number(digits[index])}em)`; });
    return;
  }
  void holder.offsetWidth;
  strips.forEach((strip, index) => {
    strip.classList.add('odometer__strip--rolling');
    strip.style.transform = `translateY(-${Number(digits[index])}em)`;
  });
}

// The bottom menu's sand pill under the chosen item's icon; hidden when no plain item is chosen (the play button).
// Measured from layout offsets and computed sizes, not rects, so a tapped button's press scale does not skew it.
export function placeNavPill(nav, pill) {
  const item = nav.querySelector('.bottom-nav__item[aria-current="page"]');
  const icon = item?.querySelector('.garden-icon');
  if (!icon) {
    pill.classList.remove('bottom-nav__pill--shown');
    return;
  }
  // The first placement jumps there; later ones glide.
  if (!pill.dataset.placed) pill.style.transition = 'none';
  const iconStyle = getComputedStyle(icon);
  const width = parseFloat(iconStyle.width) + parseFloat(iconStyle.paddingLeft) + parseFloat(iconStyle.paddingRight);
  const height = parseFloat(iconStyle.height) + parseFloat(iconStyle.paddingTop) + parseFloat(iconStyle.paddingBottom);
  const left = item.offsetLeft + (item.offsetWidth - width) / 2;
  const top = item.offsetTop + parseFloat(getComputedStyle(item).paddingTop);
  pill.style.width = `${width}px`;
  pill.style.height = `${height}px`;
  pill.style.transform = `translate(${left}px, ${top}px)`;
  pill.classList.add('bottom-nav__pill--shown');
  if (!pill.dataset.placed) {
    pill.dataset.placed = '1';
    void pill.offsetWidth;
    pill.style.transition = '';
  }
}

// The flame beside the streak; it flickers gently.
export function makeFlame() {
  return makeSvg('0 0 24 24', 'flame', [
    ['path', { d: 'M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-9z', fill: '#e3922a' }],
    ['path', { d: 'M12 12c.6 1.6 2.4 2.2 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.3.8-2 1.4-2.6.2.8.6 1.2 1 1.2 0-1.2-.4-1.9 0-2.9z', fill: '#f3c7a7' }],
  ]);
}
