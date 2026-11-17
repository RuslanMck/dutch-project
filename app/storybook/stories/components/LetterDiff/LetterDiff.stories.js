import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/LetterDiff',
  parameters: { docs: { description: { component: readme } } },
};

// One row of letters. A letter class is '' (same), 'letter--bad' (typed wrong or extra) or 'letter--fix' (right, missing or wrong).
const row = (label, letters) => `
<div class="letter-diff__row">
  <span class="letter-diff__label muted">${label}</span>
  <span class="letter-diff__letters">${letters.map((letter, index) =>
    `<span class="letter${letter.cls ? ` ${letter.cls}` : ''}" style="--delay: ${index * 70}ms">${letter.char}</span>`).join('')}</span>
</div>`;

const diff = (typed, right) => `
<div class="letter-diff">
  ${row('Ти написав', typed)}
  ${row('Правильно', right)}
</div>`;

const plain = word => [...word].map(char => ({ char }));

// The typed word and the right one, letter by letter: the wrong letter is struck through, the right one drops in.
export const Overview = {
  render: () => `<div class="col">
    ${diff([...'fietz'].map((char, i) => (i === 4 ? { char, cls: 'letter--bad' } : { char })), [...'fiets'].map((char, i) => (i === 4 ? { char, cls: 'letter--fix' } : { char })))}
  </div>`,
};

// A wrong letter in the middle: «fietz» for «fiets».
export const WrongLetter = {
  render: () => diff(
    [...'fietz'].map((char, i) => (i === 4 ? { char, cls: 'letter--bad' } : { char })),
    [...'fiets'].map((char, i) => (i === 4 ? { char, cls: 'letter--fix' } : { char })),
  ),
};

// An extra letter: the typed «fieets» has one more «e», which is struck through; the right word is the same.
export const ExtraLetter = {
  render: () => diff(
    [...'fieets'].map((char, i) => (i === 3 ? { char, cls: 'letter--bad' } : { char })),
    plain('fiets'),
  ),
};

// A missing letter: «fiet» for «fiets»; the missing «s» drops into the right row.
export const MissingLetter = {
  render: () => diff(
    plain('fiet'),
    [...'fiets'].map((char, i) => (i === 4 ? { char, cls: 'letter--fix' } : { char })),
  ),
};

// A longer word: only the one wrong letter is marked, the others stay plain («werkwoird» for «werkwoord»).
export const LongWord = {
  render: () => diff(
    [...'werkwoird'].map((char, i) => (i === 6 ? { char, cls: 'letter--bad' } : { char })),
    [...'werkwoord'].map((char, i) => (i === 6 ? { char, cls: 'letter--fix' } : { char })),
  ),
};
