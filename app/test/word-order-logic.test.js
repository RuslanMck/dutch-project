// The pure modules of the word-order exercise: tiles and answers, the sentence table of a Markdown file, the generation
// prompt and its JSON answer, and the OpenRouter client (with a fake fetch, so no request leaves the test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addSentencesInputSchema } from '../src/contracts/word-order-contracts.js';
import { ValidationError } from '../src/errors/domain-errors.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import {
  buildGenerationMessages,
  parseGeneratedSentences,
} from '../src/domains/word-order/sentence-generation-prompt.js';
import { parseSentenceMarkdown } from '../src/domains/word-order/sentence-markdown.js';
import {
  RULES,
  isCorrectOrder,
  normalizeRule,
  normalizeSentenceKey,
  pickDistractors,
  shuffleTiles,
  splitIntoTiles,
  validateSentence,
} from '../src/domains/word-order/word-order-tiles.js';

const FAKE_API_KEY = 'sk-or-test-secret-123';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// random() that returns the values in turn, then the last one forever.
function sequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index++;
    return value;
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function chatAnswer(content) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

// ---------- word-order-tiles.js ----------

test('RULES lists the eight rule names, frozen', () => {
  assert.deepEqual(RULES, ['v2', 'inversion', 'question', 'modal', 'separable', 'negation', 'subordinate', 'perfect']);
  assert.ok(Object.isFrozen(RULES));
});

test('add_sentences accepts any rule value: a bad one becomes null and the call still parses', () => {
  const parsed = addSentencesInputSchema.parse({
    sentences: [
      { nl: 'Ik ga.', uk: 'Я йду.', rule: 'greeting' },
      { nl: 'Ik werk.', uk: 'Я працюю.', rule: 42 },
      { nl: 'Ik slaap.', uk: 'Я сплю.', rule: null },
      { nl: 'Heb je een mes?', uk: 'Маєш ніж?', rule: '`Question`' },
      { nl: 'Ik eet.', uk: 'Я їм.' },
    ],
  });
  assert.deepEqual(parsed.sentences.map(sentence => sentence.rule), [null, null, null, 'question', null]);
});

test('splitIntoTiles splits on whitespace, strips edge punctuation and keeps case', () => {
  assert.deepEqual(splitIntoTiles('Morgen gaan we naar de markt.'), ['Morgen', 'gaan', 'we', 'naar', 'de', 'markt']);
  assert.deepEqual(splitIntoTiles('  «Heb je een mes?»  '), ['Heb', 'je', 'een', 'mes']);
  assert.deepEqual(splitIntoTiles('Ik  ,  ben "moe" ;ja:'), ['Ik', 'ben', 'moe', 'ja']);
});

test('splitIntoTiles keeps inner punctuation and drops tokens that are only punctuation', () => {
  assert.deepEqual(splitIntoTiles("Het is 's avonds - echt."), ["Het", "is", "'s", 'avonds', '-', 'echt']);
  assert.deepEqual(splitIntoTiles(' . ? « » '), []);
  assert.deepEqual(splitIntoTiles(''), []);
  assert.deepEqual(splitIntoTiles(undefined), []);
});

test('normalizeSentenceKey lower-cases and maps apostrophe variants to a plain apostrophe', () => {
  assert.equal(normalizeSentenceKey('Morgen gaan we naar de markt.'), 'morgen gaan we naar de markt');
  assert.equal(normalizeSentenceKey('Dat’s   ʼn  ‘test` ok.'), "dat's 'n test' ok");
});

test('splitIntoTiles strips curly quotes and an ellipsis at token ends, but keeps an inner apostrophe', () => {
  assert.deepEqual(splitIntoTiles('“Ik ben moe…”'), ['Ik', 'ben', 'moe']);
  assert.deepEqual(splitIntoTiles('„Dat is z’n fiets‘ …'), ['Dat', 'is', 'z’n', 'fiets']);
  assert.equal(normalizeSentenceKey('Dat is z’n fiets.'), "dat is z'n fiets");
});

test('normalizeRule reads a rule in any case, with backticks, asterisks, underscores or spaces, else null', () => {
  assert.equal(normalizeRule('`v2`'), 'v2');
  assert.equal(normalizeRule('Question'), 'question');
  assert.equal(normalizeRule('** Perfect **'), 'perfect');
  assert.equal(normalizeRule('_modal_'), 'modal');
  assert.equal(normalizeRule('greeting'), null);
  assert.equal(normalizeRule(''), null);
  assert.equal(normalizeRule(42), null);
  assert.equal(normalizeRule(null), null);
  assert.equal(normalizeRule(undefined), null);
});

test('isCorrectOrder accepts the right order and ignores case and final punctuation', () => {
  const dutchSentence = 'Morgen gaan we naar de markt.';
  assert.equal(isCorrectOrder({
    answerTiles: ['morgen', 'gaan', 'we', 'naar', 'de', 'markt'],
    dutchSentence,
  }), true);
  assert.equal(isCorrectOrder({
    answerTiles: ['Morgen', 'gaan', 'we', 'naar', 'de', 'markt'],
    dutchSentence,
  }), true);
});

test('isCorrectOrder rejects a wrong order, a missing tile and an extra tile', () => {
  const dutchSentence = 'Ik drink koffie.';
  assert.equal(isCorrectOrder({ answerTiles: ['koffie', 'Ik', 'drink'], dutchSentence }), false);
  assert.equal(isCorrectOrder({ answerTiles: ['Ik', 'drink'], dutchSentence }), false);
  assert.equal(isCorrectOrder({ answerTiles: ['Ik', 'drink', 'koffie', 'koffie'], dutchSentence }), false);
  assert.equal(isCorrectOrder({ answerTiles: [], dutchSentence }), false);
});

test('isCorrectOrder treats interchangeable duplicate words as the same sentence', () => {
  const dutchSentence = 'de man ziet de hond';
  assert.equal(isCorrectOrder({ answerTiles: ['de', 'man', 'ziet', 'de', 'hond'], dutchSentence }), true);
});

test('validateSentence returns null for a valid sentence', () => {
  assert.equal(validateSentence({ nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.' }), null);
});

test('validateSentence refuses a blank or missing Dutch or Ukrainian text, in Ukrainian', () => {
  assert.equal(validateSentence({ nl: '   ', uk: 'Привіт' }), 'нідерландське речення порожнє');
  assert.equal(validateSentence({ nl: undefined, uk: 'Привіт' }), 'нідерландське речення порожнє');
  assert.equal(validateSentence({ nl: 'Ik drink koffie.', uk: '' }), 'українське речення порожнє');
  assert.equal(validateSentence({ nl: 'Ik drink koffie.', uk: null }), 'українське речення порожнє');
});

test('validateSentence needs 3 to 12 tiles', () => {
  assert.match(validateSentence({ nl: 'Ik ben.', uk: 'Я є.' }), /від 3 до 12 слів, а не 2/);
  assert.equal(validateSentence({ nl: 'Ik ben blij.', uk: 'Я радий.' }), null, 'three tiles is enough');
  const twelveTiles = Array.from({ length: 12 }, (_, index) => `woord${'x'.repeat(index)}`).join(' ');
  assert.equal(validateSentence({ nl: twelveTiles, uk: 'Текст.' }), null, 'twelve tiles is enough');
  const thirteenTiles = `${twelveTiles} extra`;
  assert.match(validateSentence({ nl: thirteenTiles, uk: 'Текст.' }), /а не 13/);
});

test('validateSentence refuses digits in the Dutch sentence, but not in the Ukrainian one', () => {
  assert.match(validateSentence({ nl: 'Ik heb 2 katten.', uk: 'У мене два коти.' }), /цифр/);
  assert.equal(validateSentence({ nl: 'Ik heb twee katten.', uk: 'У мене 2 коти.' }), null);
});

test('pickDistractors gives three words when the first random number is below one half, else two', () => {
  const vocabulary = ['hond', 'kat', 'vis', 'boek', 'raam'];
  const sentenceTiles = ['Ik', 'drink', 'koffie'];
  assert.equal(pickDistractors({ sentenceTiles, vocabulary, random: sequenceRandom([0.1, 0.5, 0.5, 0.5]) }).length, 3);
  assert.equal(pickDistractors({ sentenceTiles, vocabulary, random: sequenceRandom([0.5, 0.5, 0.5, 0.5]) }).length, 2);
});

test('pickDistractors never picks a word of the sentence, in any case', () => {
  const sentenceTiles = ['Ik', 'drink', 'koffie'];
  const vocabulary = ['IK', 'Drink', 'koffie', 'thee', 'melk'];
  const picked = pickDistractors({ sentenceTiles, vocabulary, random: sequenceRandom([0.9, 0.2, 0.7, 0.1]) });
  assert.deepEqual(picked.map(word => word.toLowerCase()).sort(), ['melk', 'thee']);
});

test('pickDistractors never takes a word from a group that shares a word with the sentence', () => {
  const jeVocabulary = ['jij', 'u', 'jou', 'jouw', 'jullie', 'ze', 'zij', 'hond', 'kat'];
  for (const randomValue of [0.1, 0.9]) {
    const picked = pickDistractors({
      sentenceTiles: ['Ik', 'zie', 'je', 'morgen'],
      vocabulary: jeVocabulary,
      random: sequenceRandom([randomValue]),
    });
    assert.ok(picked.length > 0);
    assert.equal(picked.some(word => ['jij', 'u', 'jou', 'jouw', 'jullie'].includes(word)), false);
  }
  const dePicked = pickDistractors({
    sentenceTiles: ['Ik', 'zie', 'de', 'man'],
    vocabulary: ['het', 'een', 'die', 'dit', 'hond'],
    random: sequenceRandom([0.9]),
  });
  assert.equal(dePicked.some(word => ['het', 'een', 'de'].includes(word)), false);
  assert.deepEqual(
    pickDistractors({ sentenceTiles: ['Ik', 'zie', 'je'], vocabulary: ['zij', 'hond'], random: sequenceRandom([0.9]) })
      .sort(),
    ['hond', 'zij'],
  );
});

test('pickDistractors skips phrases, single letters, words with digits and blank entries', () => {
  const sentenceTiles = ['Ik', 'drink'];
  const vocabulary = ['a', 'b', 'een boek', 'raam2', 'hond', '  ', 'kat', "'s", 42, null];
  const picked = pickDistractors({ sentenceTiles, vocabulary, random: sequenceRandom([0.9]) });
  assert.deepEqual(picked, ['hond', 'kat']);
});

test('pickDistractors accepts a word with an inner hyphen or apostrophe', () => {
  assert.deepEqual(
    pickDistractors({ sentenceTiles: ['Ik'], vocabulary: ['zee-ster'], random: sequenceRandom([0.9]) }),
    ['zee-ster'],
  );
});

test('pickDistractors does not repeat a word, whatever its case', () => {
  const sentenceTiles = ['Ik'];
  const vocabulary = ['hond', 'Hond', 'HOND', 'kat'];
  const picked = pickDistractors({ sentenceTiles, vocabulary, random: sequenceRandom([0.9]) });
  assert.equal(picked.length, 2);
  assert.equal(new Set(picked.map(word => word.toLowerCase())).size, 2);
});

test('pickDistractors returns fewer words when the vocabulary is short, and none when it is empty', () => {
  const sentenceTiles = ['Ik', 'drink'];
  assert.deepEqual(pickDistractors({ sentenceTiles, vocabulary: ['hond'], random: sequenceRandom([0.9]) }), ['hond']);
  assert.deepEqual(pickDistractors({ sentenceTiles, vocabulary: [], random: sequenceRandom([0.9]) }), []);
});

test('pickDistractors keeps the vocabulary spelling of the words it picks', () => {
  const picked = pickDistractors({ sentenceTiles: ['Ik'], vocabulary: ['Hond'], random: sequenceRandom([0.9]) });
  assert.deepEqual(picked, ['Hond']);
});

test('shuffleTiles returns a new array with the same tiles and leaves the input alone', () => {
  const tiles = ['de', 'markt', 'naar', 'gaan', 'we'];
  const original = [...tiles];
  const shuffled = shuffleTiles(tiles, sequenceRandom([0.3, 0.8, 0.1, 0.6]));
  assert.notEqual(shuffled, tiles);
  assert.deepEqual(tiles, original);
  assert.deepEqual([...shuffled].sort(), [...tiles].sort());
});

test('shuffleTiles uses Fisher-Yates with the given random numbers', () => {
  // index 2 takes random 0 (swap with position 0); index 1 takes 0.99 (stays): ['c', 'b', 'a'].
  const shuffled = shuffleTiles(['a', 'b', 'c'], sequenceRandom([0, 0.99]));
  assert.deepEqual(shuffled, ['c', 'b', 'a']);
});

test('shuffleTiles shuffles again when the first order comes out unchanged', () => {
  // First attempt: 0.9999 keeps every tile in place. Second attempt: 0 then 0 gives ['b', 'c', 'a'].
  const unchangedThenChanged = sequenceRandom([0.9999, 0.9999, 0, 0]);
  assert.deepEqual(shuffleTiles(['a', 'b', 'c'], unchangedThenChanged), ['b', 'c', 'a']);
});

test('shuffleTiles gives up after ten attempts when the random numbers keep the order', () => {
  let calls = 0;
  const alwaysSame = () => {
    calls++;
    return 0.9999;
  };
  // With every random number near 1, Fisher-Yates swaps each tile with itself: the order never changes.
  const shuffled = shuffleTiles(['a', 'b', 'c'], alwaysSame);
  assert.deepEqual(shuffled, ['a', 'b', 'c']);
  assert.equal(calls, 2 * 10, 'two random calls per attempt, ten attempts');
});

test('shuffleTiles does not retry a single distinct tile', () => {
  let calls = 0;
  const countingRandom = () => {
    calls++;
    return 0.9999;
  };
  assert.deepEqual(shuffleTiles(['de', 'de', 'de'], countingRandom), ['de', 'de', 'de']);
  assert.equal(calls, 2, 'one attempt only');
});

// ---------- sentence-markdown.js ----------

const TABLE_HEADER = '| # | Українською | Nederlands | Правило |\n|---|---|---|---|\n';

test('parseSentenceMarkdown reads the rows of the prompt table', () => {
  const markdown = [
    '# Порядок слів — 2026-10-28',
    '',
    TABLE_HEADER.trimEnd(),
    '| 1 | Завтра ми йдемо на ринок. | Morgen gaan we naar de markt. | inversion |',
    '| 2 | Я п\'ю каву. | Ik drink koffie. | v2 |',
  ].join('\n');
  const result = parseSentenceMarkdown(markdown);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.sentences, [
    { nl: 'Morgen gaan we naar de markt.', uk: 'Завтра ми йдемо на ринок.', rule: 'inversion' },
    { nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2' },
  ]);
});

test('parseSentenceMarkdown turns an unknown rule into null and a missing rule column into null', () => {
  const markdown = [
    '| Українською | Nederlands | Правило |',
    '|---|---|---|',
    '| Привіт. | Hallo daar. | greeting |',
  ].join('\n');
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo daar.', uk: 'Привіт.', rule: null }]);

  const withoutRuleColumn = '| Українською | Nederlands |\n|---|---|\n| Привіт. | Hallo daar. |';
  assert.deepEqual(parseSentenceMarkdown(withoutRuleColumn).sentences, [
    { nl: 'Hallo daar.', uk: 'Привіт.', rule: null },
  ]);
});

test('parseSentenceMarkdown matches the column names case-insensitively and trims cells', () => {
  const markdown = '|  nederlands |UKRAINIAN? |\n|---|---|\n|  Ik ben moe.  |  x |';
  assert.deepEqual(parseSentenceMarkdown(markdown).errors, [
    'не знайдено таблицю з колонками «Українською» і «Nederlands»',
  ]);
  const matchingHeader = '|  nederlands | УКРАЇНСЬКОЮ |\n|---|---|\n|  Ik ben moe.  | Я втомлений. |';
  assert.deepEqual(parseSentenceMarkdown(matchingHeader).sentences, [
    { nl: 'Ik ben moe.', uk: 'Я втомлений.', rule: null },
  ]);
});

test('parseSentenceMarkdown reports a row with a blank Dutch or Ukrainian cell and keeps the others', () => {
  const markdown = [
    TABLE_HEADER.trimEnd(),
    '| 1 | Перше. | Eerste zin. | v2 |',
    '| 2 |  | Tweede zin. | v2 |',
    '| 3 | Третє. |  | v2 |',
    '| 4 |  |  | v2 |',
  ].join('\n');
  const result = parseSentenceMarkdown(markdown);
  assert.deepEqual(result.sentences, [{ nl: 'Eerste zin.', uk: 'Перше.', rule: 'v2' }]);
  assert.deepEqual(result.errors, [
    'рядок 2: порожнє українське речення',
    'рядок 3: порожнє нідерландське речення',
    'рядок 4: порожні нідерландське і українське речення',
  ]);
});

test('parseSentenceMarkdown reports no table when the headers are missing', () => {
  const result = parseSentenceMarkdown('# Нічого\n\nПросто текст.\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(result.sentences, []);
  assert.deepEqual(result.errors, ['не знайдено таблицю з колонками «Українською» і «Nederlands»']);
});

test('parseSentenceMarkdown reads the first table that has both columns', () => {
  const markdown = [
    '| Колонка | Інша |',
    '|---|---|',
    '| x | y |',
    '',
    '| Українською | Nederlands |',
    '|---|---|',
    '| Привіт. | Hallo. |',
    '',
    '| Українською | Nederlands |',
    '|---|---|',
    '| Другий. | Tweede. |',
  ].join('\n');
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo.', uk: 'Привіт.', rule: null }]);
});

test('parseSentenceMarkdown treats an escaped pipe as a literal pipe inside a cell', () => {
  const markdown = '| Українською | Nederlands |\n|---|---|\n| Або a \\| b. | Kies a \\| b. |';
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [
    { nl: 'Kies a | b.', uk: 'Або a | b.', rule: null },
  ]);
});

test('parseSentenceMarkdown accepts CRLF line endings and text without a table', () => {
  const markdown = '| Українською | Nederlands |\r\n|---|---|\r\n| Привіт. | Hallo. |\r\n';
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo.', uk: 'Привіт.', rule: null }]);
  assert.deepEqual(parseSentenceMarkdown('').sentences, []);
  assert.deepEqual(parseSentenceMarkdown(undefined).errors, [
    'не знайдено таблицю з колонками «Українською» і «Nederlands»',
  ]);
});

test('parseSentenceMarkdown strips backticks and emphasis from the rule, the cells and the headers', () => {
  const markdown = [
    '| **Українською** | **Nederlands** | Правило |',
    '|---|---|---|',
    '| Я п\'ю каву. | `Ik drink koffie.` | `v2` |',
    '| Ти вдома? | Ben je thuis? | Question |',
    '| Я дзвоню тобі. | **Ik bel je op.** | *separable* |',
    '| Я йду. | __Ik ga.__ | __negation__ |',
  ].join('\n');
  assert.deepEqual(parseSentenceMarkdown(markdown), {
    sentences: [
      { nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2' },
      { nl: 'Ben je thuis?', uk: 'Ти вдома?', rule: 'question' },
      { nl: 'Ik bel je op.', uk: 'Я дзвоню тобі.', rule: 'separable' },
      { nl: 'Ik ga.', uk: 'Я йду.', rule: 'negation' },
    ],
    errors: [],
  });
});

test('parseSentenceMarkdown matches a bold or backticked header case-insensitively', () => {
  const markdown = '| `українською` | **nederlands** |\n|---|---|\n| Привіт. | Hallo. |';
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo.', uk: 'Привіт.', rule: null }]);
});

test('parseSentenceMarkdown returns frozen results', () => {
  const result = parseSentenceMarkdown('| Українською | Nederlands |\n|---|---|\n| Привіт. | Hallo. |');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.sentences));
  assert.ok(Object.isFrozen(result.sentences[0]));
});

// ---------- sentence-generation-prompt.js ----------

test('buildGenerationMessages makes a system and a user message', () => {
  const messages = buildGenerationMessages({
    knownWords: ['drinken'],
    otherWords: ['koffie'],
    existingSentences: ['Ik drink koffie.'],
    count: 7,
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.ok(Object.isFrozen(messages));
});

test('the system message holds the generation rules, the rule names and the JSON shape', () => {
  const [systemMessage] = buildGenerationMessages({ count: 5 });
  for (const rule of RULES) assert.ok(systemMessage.content.includes(rule), `rule ${rule} is named`);
  assert.match(systemMessage.content, /4 to 9 words/);
  assert.match(systemMessage.content, /No commas/);
  assert.match(systemMessage.content, /\{"sentences":\[\{"nl":"\.\.\.","uk":"\.\.\.","rule":"\.\.\."\}\]\}/);
});

test('the user message lists the known words, the other words, the saved sentences and the count', () => {
  const [, userMessage] = buildGenerationMessages({
    knownWords: ['drinken', 'koffie'],
    otherWords: ['melk'],
    existingSentences: ['Ik drink koffie.', { nl: 'Jij bent moe.' }],
    count: 12,
  });
  assert.match(userMessage.content, /Make 12 new sentences\./);
  assert.match(userMessage.content, /drinken, koffie/);
  assert.match(userMessage.content, /melk/);
  assert.match(userMessage.content, /- Ik drink koffie\./);
  assert.match(userMessage.content, /- Jij bent moe\./);
});

test('the user message shows (none) for empty lists and uses at most 200 saved sentences', () => {
  const emptyUserMessage = buildGenerationMessages({ count: 3 })[1].content;
  assert.match(emptyUserMessage, /\(none\)/);
  const manySentences = Array.from({ length: 250 }, (_, index) => `Zin nummer ${index}.`);
  const content = buildGenerationMessages({ existingSentences: manySentences, count: 3 })[1].content;
  assert.ok(content.includes('- Zin nummer 199.'));
  assert.ok(!content.includes('- Zin nummer 200.'));
});

test('parseGeneratedSentences reads a plain JSON object', () => {
  const answer = JSON.stringify({
    sentences: [{ nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2' }],
  });
  assert.deepEqual(parseGeneratedSentences(answer), [{ nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2' }]);
});

test('parseGeneratedSentences reads the JSON inside a fence, with or without the json tag', () => {
  const body = '{"sentences":[{"nl":"Heb je een mes?","uk":"Є в тебе ніж?","rule":"question"}]}';
  const expected = [{ nl: 'Heb je een mes?', uk: 'Є в тебе ніж?', rule: 'question' }];
  assert.deepEqual(parseGeneratedSentences(`\`\`\`json\n${body}\n\`\`\``), expected);
  assert.deepEqual(parseGeneratedSentences(`\`\`\`\n${body}\n\`\`\``), expected);
});

test('parseGeneratedSentences makes an unknown rule null and drops items without string nl or uk', () => {
  const answer = JSON.stringify({
    sentences: [
      { nl: 'Ik slaap.', uk: 'Я сплю.', rule: 'nonsense' },
      { nl: 'Geen tekst.', uk: 42, rule: 'v2' },
      { uk: 'Ontbrekend.', rule: 'v2' },
      'just a string',
      null,
      { nl: 'Ik werk.', uk: 'Я працюю.' },
    ],
  });
  assert.deepEqual(parseGeneratedSentences(answer), [
    { nl: 'Ik slaap.', uk: 'Я сплю.', rule: null },
    { nl: 'Ik werk.', uk: 'Я працюю.', rule: null },
  ]);
});

test('parseGeneratedSentences reads the JSON object inside text that has words around it', () => {
  const body = '{"sentences":[{"nl":"Ik ga.","uk":"Я йду.","rule":"v2"}]}';
  const expected = [{ nl: 'Ik ga.', uk: 'Я йду.', rule: 'v2' }];
  assert.deepEqual(parseGeneratedSentences(`Hier is het antwoord: ${body} Veel succes!`), expected);
  assert.deepEqual(parseGeneratedSentences(`Here you go:\n\`\`\`\n${body}\n\`\`\`\nThanks`), expected);
});

test('parseGeneratedSentences keeps only count sentences when count is given', () => {
  const answer = JSON.stringify({
    sentences: [
      { nl: 'Ik ga.', uk: 'Я йду.', rule: 'v2' },
      { nl: 'Ik werk.', uk: 'Я працюю.', rule: 'v2' },
      { nl: 'Ik slaap.', uk: 'Я сплю.', rule: 'v2' },
    ],
  });
  assert.deepEqual(parseGeneratedSentences(answer, { count: 2 }).map(sentence => sentence.nl), ['Ik ga.', 'Ik werk.']);
  assert.equal(parseGeneratedSentences(answer).length, 3);
});

test('parseGeneratedSentences normalises the rule text the model wrote', () => {
  const answer = JSON.stringify({ sentences: [{ nl: 'Heb je een mes?', uk: 'Маєш ніж?', rule: '`Question`' }] });
  assert.deepEqual(parseGeneratedSentences(answer), [{ nl: 'Heb je een mes?', uk: 'Маєш ніж?', rule: 'question' }]);
});

test('parseGeneratedSentences trims the sentence texts', () => {
  const answer = JSON.stringify({ sentences: [{ nl: '  Ik ga.  ', uk: ' Я йду. ', rule: 'v2' }] });
  assert.deepEqual(parseGeneratedSentences(answer), [{ nl: 'Ik ga.', uk: 'Я йду.', rule: 'v2' }]);
});

test('parseGeneratedSentences returns an empty list for an empty sentences array', () => {
  assert.deepEqual(parseGeneratedSentences('{"sentences":[]}'), []);
});

test('parseGeneratedSentences throws a ValidationError when the answer is not JSON', () => {
  for (const text of ['Hier zijn de zinnen: ...', '', '["zin"]', 'null', '42', '```json\nniet json\n```']) {
    assert.throws(() => parseGeneratedSentences(text), error => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, 'відповідь моделі не JSON');
      return true;
    }, `throws for ${JSON.stringify(text)}`);
  }
});

test('parseGeneratedSentences throws a ValidationError when there is no sentences array', () => {
  assert.throws(() => parseGeneratedSentences('{"items":[]}'), ValidationError);
  assert.throws(() => parseGeneratedSentences('{"sentences":"een zin"}'), ValidationError);
});

// ---------- openrouter-client.js ----------

// Records every call and answers with the given response (a function of the call index).
function createRecordingFetch(respond) {
  const calls = [];
  const fetchFunction = async (url, options) => {
    calls.push({ url, options });
    return respond(calls.length - 1);
  };
  return { fetchFunction, calls };
}

test('createOpenRouterClient is configured only with an API key', () => {
  assert.equal(createOpenRouterClient({ apiKey: FAKE_API_KEY, model: 'm' }).isConfigured, true);
  assert.equal(createOpenRouterClient({ apiKey: '', model: 'm' }).isConfigured, false);
  assert.equal(createOpenRouterClient({ model: 'm' }).isConfigured, false);
  assert.ok(Object.isFrozen(createOpenRouterClient({ apiKey: FAKE_API_KEY, model: 'm' })));
});

test('completeChat posts the messages to the chat endpoint and returns the content', async () => {
  const messages = [{ role: 'user', content: 'hallo' }];
  const { fetchFunction, calls } = createRecordingFetch(() => jsonResponse(chatAnswer('{"sentences":[]}')));
  const client = createOpenRouterClient({ apiKey: FAKE_API_KEY, model: 'test/model', fetchFunction });

  const content = await client.completeChat(messages);

  assert.equal(content, '{"sentences":[]}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CHAT_URL);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${FAKE_API_KEY}`);
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: 'test/model',
    messages,
    response_format: { type: 'json_object' },
  });
  assert.ok(calls[0].options.signal instanceof AbortSignal, 'the request has a timeout signal');
});

test('the timeout signal is passed to fetch and aborts after the timeout', async () => {
  let receivedSignal;
  const fetchFunction = (url, options) => {
    receivedSignal = options.signal;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    });
  };
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction,
    timeoutMilliseconds: 10,
  });
  await assert.rejects(client.completeChat([]), /OpenRouter: request timed out/);
  assert.equal(receivedSignal.aborted, true);
});

test('a request that times out with a TimeoutError or AbortError says so, without the key', async () => {
  for (const errorName of ['TimeoutError', 'AbortError']) {
    const client = createOpenRouterClient({
      apiKey: FAKE_API_KEY,
      model: 'm',
      fetchFunction: async () => {
        const error = new Error(`aborted with ${FAKE_API_KEY}`);
        error.name = errorName;
        throw error;
      },
    });
    await assert.rejects(client.completeChat([]), { message: 'OpenRouter: request timed out' });
  }
});

test('a non-2xx answer whose provider message echoes the key does not show the key', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => jsonResponse({ error: { message: `invalid key ${FAKE_API_KEY}` } }, 401),
  });
  await assert.rejects(client.completeChat([]), error => {
    assert.equal(error.message, 'OpenRouter: HTTP 401: invalid key [redacted]');
    return true;
  });
});

test('a network error whose message contains the key does not show the key', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => {
      throw new Error(`connect failed with ${FAKE_API_KEY}`);
    },
  });
  await assert.rejects(client.completeChat([]), error => {
    assert.equal(error.message, 'OpenRouter: connect failed with [redacted]');
    return true;
  });
});

test('a non-2xx answer throws an OpenRouter error with the status and the provider message', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => jsonResponse({ error: { message: 'Rate limit exceeded' } }, 429),
  });
  await assert.rejects(client.completeChat([]), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'OpenRouter: HTTP 429: Rate limit exceeded');
    return true;
  });
});

test('a non-2xx answer without a readable body throws with only the status', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => new Response('<html>Bad gateway</html>', { status: 502 }),
  });
  await assert.rejects(client.completeChat([]), { message: 'OpenRouter: HTTP 502' });
});

test('a network error throws an OpenRouter error with its message', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(client.completeChat([]), { message: 'OpenRouter: fetch failed' });
});

test('an answer without message content throws', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => jsonResponse({ choices: [] }),
  });
  await assert.rejects(client.completeChat([]), { message: 'OpenRouter: response has no message content' });
});

test('an answer that is not JSON throws', async () => {
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => new Response('not json', { status: 200 }),
  });
  await assert.rejects(client.completeChat([]), { message: 'OpenRouter: response is not JSON' });
});

test('completeChat without a key throws and does not call fetch', async () => {
  const { fetchFunction, calls } = createRecordingFetch(() => jsonResponse(chatAnswer('x')));
  const client = createOpenRouterClient({ apiKey: '', model: 'm', fetchFunction });
  await assert.rejects(client.completeChat([]), { message: 'OpenRouter: API key is not configured' });
  assert.equal(calls.length, 0);
});

test('the API key never appears in any error the client throws', async () => {
  const scenarios = [
    // The key is echoed back in the provider message, in the network error and in the timeout-free failure.
    () => createOpenRouterClient({
      apiKey: FAKE_API_KEY,
      model: 'm',
      fetchFunction: async () => jsonResponse({ error: { message: `bad key ${FAKE_API_KEY}` } }, 401),
    }),
    () => createOpenRouterClient({
      apiKey: FAKE_API_KEY,
      model: 'm',
      fetchFunction: async () => {
        throw new Error(`connect failed for ${FAKE_API_KEY}`);
      },
    }),
    () => createOpenRouterClient({
      apiKey: FAKE_API_KEY,
      model: 'm',
      fetchFunction: async () => new Response(`echo ${FAKE_API_KEY}`, { status: 500 }),
    }),
    () => createOpenRouterClient({
      apiKey: FAKE_API_KEY,
      model: 'm',
      fetchFunction: async () => jsonResponse({ choices: [{ message: { content: 42 } }] }),
    }),
  ];
  for (const createScenarioClient of scenarios) {
    await assert.rejects(createScenarioClient().completeChat([]), error => {
      assert.ok(error.message.startsWith('OpenRouter:'));
      assert.equal(error.message.includes(FAKE_API_KEY), false, 'the key is scrubbed');
      assert.equal(String(error.stack ?? '').includes(FAKE_API_KEY), false, 'the stack has no key either');
      return true;
    });
  }
});

test('the API key is scrubbed from a provider message that is cut to 200 characters', async () => {
  const longMessage = `${'x'.repeat(300)} ${FAKE_API_KEY}`;
  const client = createOpenRouterClient({
    apiKey: FAKE_API_KEY,
    model: 'm',
    fetchFunction: async () => jsonResponse({ error: { message: longMessage } }, 400),
  });
  await assert.rejects(client.completeChat([]), error => {
    assert.equal(error.message.length <= 'OpenRouter: HTTP 400: '.length + 200, true);
    assert.equal(error.message.includes(FAKE_API_KEY), false);
    return true;
  });
});
