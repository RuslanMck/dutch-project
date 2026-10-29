// The pure modules of the word-order exercise: tiles and answers, the sentence table of a Markdown file, the generation
// prompt and its JSON answer, and the OpenRouter client (with a fake fetch, so no request leaves the test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addSentencesInputSchema, updateSentenceInputSchema } from '../src/contracts/word-order-contracts.js';
import { ValidationError } from '../src/errors/domain-errors.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import {
  buildGenerationMessages,
  parseGeneratedSentences,
} from '../src/domains/word-order/sentence-generation-prompt.js';
import {
  parseAlternativeOrdersText,
  parseSentenceMarkdown,
  parseStructureText,
} from '../src/domains/word-order/sentence-markdown.js';
import {
  RULES,
  STRUCTURE_ROLES,
  findMatchingOrderIndex,
  isCorrectOrder,
  isSameWordMultiset,
  listAcceptedOrders,
  normalizeAltOrders,
  normalizeRule,
  normalizeRuleNames,
  normalizeSentenceKey,
  normalizeStructure,
  parseStoredAltOrders,
  parseStoredStructure,
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
      { nl: 'Ik ga.', uk: 'Я йду.', rule: 'greeting', structure: null },
      { nl: 'Ik werk.', uk: 'Я працюю.', rule: 42 },
      { nl: 'Ik slaap.', uk: 'Я сплю.', rule: null, structure: null },
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
  assert.equal(normalizeSentenceKey('Dat’s   ʼn  ‘test` ok.'), "dat's 'n 'test' ok");
});

test('splitIntoTiles strips curly double quotes and an ellipsis at token ends; apostrophe variants become \' and stay', () => {
  assert.deepEqual(splitIntoTiles('“Ik ben moe…”'), ['Ik', 'ben', 'moe']);
  assert.deepEqual(splitIntoTiles('„Dat is z’n fiets‘ …'), ['Dat', 'is', "z'n", "fiets'"]);
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
    { nl: 'Morgen gaan we naar de markt.', uk: 'Завтра ми йдемо на ринок.', rule: 'inversion', structure: null, alt_orders: [], row: 1 },
    { nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2', structure: null, alt_orders: [], row: 2 },
  ]);
});

test('parseSentenceMarkdown turns an unknown rule into null and a missing rule column into null', () => {
  const markdown = [
    '| Українською | Nederlands | Правило |',
    '|---|---|---|',
    '| Привіт. | Hallo daar. | greeting |',
  ].join('\n');
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo daar.', uk: 'Привіт.', rule: null, structure: null, alt_orders: [], row: 1 }]);

  const withoutRuleColumn = '| Українською | Nederlands |\n|---|---|\n| Привіт. | Hallo daar. |';
  assert.deepEqual(parseSentenceMarkdown(withoutRuleColumn).sentences, [
    { nl: 'Hallo daar.', uk: 'Привіт.', rule: null, structure: null, alt_orders: [], row: 1 },
  ]);
});

test('parseSentenceMarkdown matches the column names case-insensitively and trims cells', () => {
  const markdown = '|  nederlands |UKRAINIAN? |\n|---|---|\n|  Ik ben moe.  |  x |';
  assert.deepEqual(parseSentenceMarkdown(markdown).errors, [
    'не знайдено таблицю з колонками «Українською» і «Nederlands»',
  ]);
  const matchingHeader = '|  nederlands | УКРАЇНСЬКОЮ |\n|---|---|\n|  Ik ben moe.  | Я втомлений. |';
  assert.deepEqual(parseSentenceMarkdown(matchingHeader).sentences, [
    { nl: 'Ik ben moe.', uk: 'Я втомлений.', rule: null, structure: null, alt_orders: [], row: 1 },
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
  assert.deepEqual(result.sentences, [{ nl: 'Eerste zin.', uk: 'Перше.', rule: 'v2', structure: null, alt_orders: [], row: 1 }]);
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
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo.', uk: 'Привіт.', rule: null, structure: null, alt_orders: [], row: 1 }]);
});

test('parseSentenceMarkdown treats an escaped pipe as a literal pipe inside a cell', () => {
  const markdown = '| Українською | Nederlands |\n|---|---|\n| Або a \\| b. | Kies a \\| b. |';
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [
    { nl: 'Kies a | b.', uk: 'Або a | b.', rule: null, structure: null, alt_orders: [], row: 1 },
  ]);
});

test('parseSentenceMarkdown accepts CRLF line endings and text without a table', () => {
  const markdown = '| Українською | Nederlands |\r\n|---|---|\r\n| Привіт. | Hallo. |\r\n';
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo.', uk: 'Привіт.', rule: null, structure: null, alt_orders: [], row: 1 }]);
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
      { nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2', structure: null, alt_orders: [], row: 1 },
      { nl: 'Ben je thuis?', uk: 'Ти вдома?', rule: 'question', structure: null, alt_orders: [], row: 2 },
      { nl: 'Ik bel je op.', uk: 'Я дзвоню тобі.', rule: 'separable', structure: null, alt_orders: [], row: 3 },
      { nl: 'Ik ga.', uk: 'Я йду.', rule: 'negation', structure: null, alt_orders: [], row: 4 },
    ],
    errors: [],
    warnings: [],
  });
});

test('parseSentenceMarkdown matches a bold or backticked header case-insensitively', () => {
  const markdown = '| `українською` | **nederlands** |\n|---|---|\n| Привіт. | Hallo. |';
  assert.deepEqual(parseSentenceMarkdown(markdown).sentences, [{ nl: 'Hallo.', uk: 'Привіт.', rule: null, structure: null, alt_orders: [], row: 1 }]);
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
  assert.match(
    systemMessage.content,
    /\{"sentences":\[\{"nl":"\.\.\.","uk":"\.\.\.","rule":"\.\.\.","structure":\[\{"text":"\.\.\.","role":"\.\.\."\}\],"alt_orders":\["\.\.\."\]\}\]\}/,
  );
  assert.match(systemMessage.content, /alt_orders: every other natural word order/);
  assert.equal(systemMessage.content.includes('Only one correct word order'), false);
  for (const role of STRUCTURE_ROLES) assert.ok(systemMessage.content.includes(role), `role ${role} is named`);
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
    sentences: [{ nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2', structure: null }],
  });
  assert.deepEqual(parseGeneratedSentences(answer), [{ nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2', structure: null, alt_orders: [] }]);
});

test('parseGeneratedSentences reads the JSON inside a fence, with or without the json tag', () => {
  const body = '{"sentences":[{"nl":"Heb je een mes?","uk":"Є в тебе ніж?","rule":"question"}]}';
  const expected = [{ nl: 'Heb je een mes?', uk: 'Є в тебе ніж?', rule: 'question', structure: null, alt_orders: [] }];
  assert.deepEqual(parseGeneratedSentences(`\`\`\`json\n${body}\n\`\`\``), expected);
  assert.deepEqual(parseGeneratedSentences(`\`\`\`\n${body}\n\`\`\``), expected);
});

test('parseGeneratedSentences makes an unknown rule null and drops items without string nl or uk', () => {
  const answer = JSON.stringify({
    sentences: [
      { nl: 'Ik slaap.', uk: 'Я сплю.', rule: 'nonsense', structure: null },
      { nl: 'Geen tekst.', uk: 42, rule: 'v2', structure: null },
      { uk: 'Ontbrekend.', rule: 'v2', structure: null },
      'just a string',
      null,
      { nl: 'Ik werk.', uk: 'Я працюю.' },
    ],
  });
  assert.deepEqual(parseGeneratedSentences(answer), [
    { nl: 'Ik slaap.', uk: 'Я сплю.', rule: null, structure: null, alt_orders: [] },
    { nl: 'Ik werk.', uk: 'Я працюю.', rule: null, structure: null, alt_orders: [] },
  ]);
});

test('parseGeneratedSentences reads the JSON object inside text that has words around it', () => {
  const body = '{"sentences":[{"nl":"Ik ga.","uk":"Я йду.","rule":"v2"}]}';
  const expected = [{ nl: 'Ik ga.', uk: 'Я йду.', rule: 'v2', structure: null, alt_orders: [] }];
  assert.deepEqual(parseGeneratedSentences(`Hier is het antwoord: ${body} Veel succes!`), expected);
  assert.deepEqual(parseGeneratedSentences(`Here you go:\n\`\`\`\n${body}\n\`\`\`\nThanks`), expected);
});

test('parseGeneratedSentences keeps only count sentences when count is given', () => {
  const answer = JSON.stringify({
    sentences: [
      { nl: 'Ik ga.', uk: 'Я йду.', rule: 'v2', structure: null },
      { nl: 'Ik werk.', uk: 'Я працюю.', rule: 'v2', structure: null },
      { nl: 'Ik slaap.', uk: 'Я сплю.', rule: 'v2', structure: null },
    ],
  });
  assert.deepEqual(parseGeneratedSentences(answer, { count: 2 }).map(sentence => sentence.nl), ['Ik ga.', 'Ik werk.']);
  assert.equal(parseGeneratedSentences(answer).length, 3);
});

test('parseGeneratedSentences normalises the rule text the model wrote', () => {
  const answer = JSON.stringify({ sentences: [{ nl: 'Heb je een mes?', uk: 'Маєш ніж?', rule: '`Question`' }] });
  assert.deepEqual(parseGeneratedSentences(answer), [{ nl: 'Heb je een mes?', uk: 'Маєш ніж?', rule: 'question', structure: null, alt_orders: [] }]);
});

test('parseGeneratedSentences trims the sentence texts', () => {
  const answer = JSON.stringify({ sentences: [{ nl: '  Ik ga.  ', uk: ' Я йду. ', rule: 'v2', structure: null }] });
  assert.deepEqual(parseGeneratedSentences(answer), [{ nl: 'Ik ga.', uk: 'Я йду.', rule: 'v2', structure: null, alt_orders: [] }]);
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

// ---------- sentence structure and rule filter ----------

const KOFFIE_STRUCTURE = [
  { text: 'Ik', role: 'підмет' },
  { text: 'drink', role: 'дієслово' },
  { text: 'koffie', role: 'додаток' },
];

test('add_sentences accepts any structure value: a bad one never fails the parse', () => {
  const parsed = addSentencesInputSchema.parse({
    sentences: [
      { nl: 'Ik ga.', uk: 'Я йду.', structure: 'Ik (підмет) + ga (дієслово)' },
      { nl: 'Ik werk.', uk: 'Я працюю.', structure: [{ text: 1 }] },
      { nl: 'Ik eet.', uk: 'Я їм.', structure: null },
      { nl: 'Ik slaap.', uk: 'Я сплю.', structure: KOFFIE_STRUCTURE },
    ],
  });
  assert.equal(parsed.sentences.length, 4);
  assert.deepEqual(parsed.sentences[3].structure, KOFFIE_STRUCTURE);
});

test('STRUCTURE_ROLES lists the seventeen roles of a schema, частка among them', () => {
  assert.equal(STRUCTURE_ROLES.length, 17);
  assert.ok(STRUCTURE_ROLES.includes('підмет'));
  assert.ok(STRUCTURE_ROLES.includes('питальне слово'));
  assert.ok(STRUCTURE_ROLES.includes('частка'));
  assert.ok(Object.isFrozen(STRUCTURE_ROLES));
});

test('normalizeStructure keeps valid segments, trimmed, with the role lower-cased', () => {
  const structure = normalizeStructure({
    nl: 'Ik drink koffie.',
    structure: [{ text: ' Ik ', role: ' Підмет ' }, { text: 'drink', role: 'дієслово' }, { text: 'koffie', role: 'додаток' }],
  });
  assert.deepEqual(structure, KOFFIE_STRUCTURE);
  assert.ok(Object.isFrozen(structure));
});

test('normalizeStructure refuses a schema whose texts are not the sentence words in order', () => {
  const nl = 'Ik drink koffie.';
  assert.equal(normalizeStructure({
    nl,
    structure: [{ text: 'drink', role: 'дієслово' }, { text: 'Ik', role: 'підмет' }, { text: 'koffie', role: 'додаток' }],
  }), null, 'wrong order');
  assert.equal(normalizeStructure({
    nl,
    structure: [{ text: 'Ik', role: 'підмет' }, { text: 'koffie', role: 'додаток' }],
  }), null, 'a word missing');
  assert.equal(normalizeStructure({
    nl,
    structure: [{ text: 'Ik', role: 'підмет' }, { text: 'drink', role: 'дієслово' }, { text: 'thee', role: 'додаток' }],
  }), null, 'another word');
});

test('normalizeStructure ignores case and punctuation when it compares the words', () => {
  const structure = normalizeStructure({
    nl: '«IK drink, koffie!»',
    structure: [{ text: 'ik', role: 'підмет' }, { text: 'Drink.', role: 'дієслово' }, { text: 'koffie', role: 'додаток' }],
  });
  assert.equal(structure.length, 3);
});

test('normalizeStructure refuses a segment with no word in it (punctuation only) and keeps the text as written', () => {
  const nl = 'Ik ga.';
  assert.equal(normalizeStructure({
    nl,
    structure: [{ text: 'Ik', role: 'підмет' }, { text: 'ga', role: 'дієслово' }, { text: '.', role: 'інше' }],
  }), null, 'a full stop as a segment');
  assert.equal(normalizeStructure({
    nl: 'Ik ga?',
    structure: [{ text: 'Ik', role: 'підмет' }, { text: ' ?! ', role: 'дієслово' }, { text: 'ga', role: 'дієслово' }],
  }), null, 'punctuation in the middle');
  const kept = normalizeStructure({
    nl,
    structure: [{ text: 'Ik', role: 'підмет' }, { text: 'ga.', role: 'дієслово' }],
  });
  assert.deepEqual(kept, [{ text: 'Ik', role: 'підмет' }, { text: 'ga.', role: 'дієслово' }]);
});

test('apostrophe variants read as the plain one, so ’s and \'s give the same tiles, and the apostrophe is kept', () => {
  const plain = splitIntoTiles("Ik kom 's avonds thuis.");
  assert.deepEqual(plain, ['Ik', 'kom', "'s", 'avonds', 'thuis']);
  for (const variant of ['’', 'ʼ', '‘', '`']) {
    assert.deepEqual(splitIntoTiles(`Ik kom ${variant}s avonds thuis.`), plain, `variant ${variant}`);
  }
  assert.deepEqual(splitIntoTiles("'s avonds"), ["'s", 'avonds'], 'a leading apostrophe is not stripped');
  assert.deepEqual(splitIntoTiles('’s avonds'), splitIntoTiles("'s avonds"));
  assert.equal(normalizeSentenceKey('Ik kom ’s avonds.'), normalizeSentenceKey("Ik kom 's avonds."));
  assert.equal(isCorrectOrder({ answerTiles: ['thuis', 'avonds', '’s', 'kom', 'Ik'], dutchSentence: "Ik kom 's avonds thuis." }), false);
  assert.equal(isCorrectOrder({ answerTiles: ['Ik', 'kom', '’s', 'avonds', 'thuis'], dutchSentence: "Ik kom 's avonds thuis." }), true);
});

test('normalizeStructure matches a ’s segment against a sentence with \'s, and the other way round', () => {
  const structureWithCurly = [
    { text: 'Ik', role: 'підмет' },
    { text: 'kom', role: 'дієслово' },
    { text: '’s avonds', role: 'час' },
    { text: 'thuis', role: 'місце' },
  ];
  const kept = normalizeStructure({ nl: "Ik kom 's avonds thuis.", structure: structureWithCurly });
  assert.deepEqual(kept, structureWithCurly, 'the segment text is kept as written');
  const structureWithStraight = [
    { text: 'Ik', role: 'підмет' },
    { text: 'kom', role: 'дієслово' },
    { text: "'s avonds", role: 'час' },
    { text: 'thuis', role: 'місце' },
  ];
  assert.deepEqual(normalizeStructure({ nl: 'Ik kom ’s avonds thuis.', structure: structureWithStraight }), structureWithStraight);
});

test('normalizeStructure allows up to twelve segments and refuses thirteen, blank parts and long roles', () => {
  const words = Array.from({ length: 13 }, (_, index) => `w${index}`);
  const segmentsOf = count => words.slice(0, count).map(word => ({ text: word, role: 'додаток' }));
  assert.equal(normalizeStructure({ nl: words.slice(0, 12).join(' '), structure: segmentsOf(12) }).length, 12);
  assert.equal(normalizeStructure({ nl: words.join(' '), structure: segmentsOf(13) }), null, 'thirteen segments');
  assert.equal(normalizeStructure({ nl: 'Ik drink koffie.', structure: [] }), null, 'no segments');
  assert.equal(normalizeStructure({
    nl: 'Ik drink koffie.',
    structure: [{ text: 'Ik', role: ' ' }, { text: 'drink', role: 'дієслово' }, { text: 'koffie', role: 'додаток' }],
  }), null, 'blank role');
  assert.equal(normalizeStructure({
    nl: 'Ik drink koffie.',
    structure: [{ text: 'Ik', role: 'x'.repeat(31) }, { text: 'drink', role: 'дієслово' }, { text: 'koffie', role: 'додаток' }],
  }), null, 'role longer than 30 characters');
  assert.equal(normalizeStructure({ nl: 'Ik drink koffie.', structure: 'Ik (підмет)' }), null, 'not an array');
  assert.equal(normalizeStructure({ nl: 'Ik drink koffie.' }), null, 'missing');
});

test('parseStoredStructure reads the stored JSON back, and gives null for NULL or junk', () => {
  assert.deepEqual(parseStoredStructure(JSON.stringify(KOFFIE_STRUCTURE)), KOFFIE_STRUCTURE);
  assert.equal(parseStoredStructure(null), null);
  assert.equal(parseStoredStructure('{"text":"Ik"}'), null);
  assert.equal(parseStoredStructure('не JSON'), null);
});

test('parseStructureText reads the schema cell into segments', () => {
  assert.deepEqual(parseStructureText('Deze week (час) + ben (дієслово) + ik (підмет) + jarig (прикметник)'), [
    { text: 'Deze week', role: 'час' },
    { text: 'ben', role: 'дієслово' },
    { text: 'ik', role: 'підмет' },
    { text: 'jarig', role: 'прикметник' },
  ]);
});

test('parseStructureText splits on + with or without spaces, and keeps brackets inside the Dutch text', () => {
  assert.deepEqual(parseStructureText('Ik (підмет)+ga (дієслово)'), [
    { text: 'Ik', role: 'підмет' },
    { text: 'ga', role: 'дієслово' },
  ]);
  assert.deepEqual(parseStructureText('Ik (підмет)  +  ga (дієслово)'), [
    { text: 'Ik', role: 'підмет' },
    { text: 'ga', role: 'дієслово' },
  ]);
  assert.deepEqual(parseStructureText('Ik (bedoel) iets (додаток) + ga (дієслово)'), [
    { text: 'Ik (bedoel) iets', role: 'додаток' },
    { text: 'ga', role: 'дієслово' },
  ]);
});

test('parseStructureText drops backticks and emphasis marks from each text and role', () => {
  assert.deepEqual(parseStructureText('**Ik** (_підмет_) + `ga` (`дієслово`) + *je* (*частка*)'), [
    { text: 'Ik', role: 'підмет' },
    { text: 'ga', role: 'дієслово' },
    { text: 'je', role: 'частка' },
  ]);
  assert.equal(parseStructureText('** (час)'), null, 'emphasis only, no text');
  assert.equal(parseStructureText('ga (`  `)'), null, 'backticks only, no role');
});

test('parseStructureText returns null for an empty cell or a segment it cannot read', () => {
  assert.equal(parseStructureText(''), null);
  assert.equal(parseStructureText(undefined), null);
  assert.equal(parseStructureText('Deze week + ben (дієслово)'), null, 'no role in the first segment');
  assert.equal(parseStructureText('Deze week (час) + (дієслово)'), null, 'no text in the second segment');
  assert.equal(parseStructureText('Ik (підмет) + ben (дієслово'), null, 'unclosed bracket');
});

test('parseSentenceMarkdown reads the Схема column, and warns about a schema it cannot read', () => {
  const markdown = [
    '| Українською | Nederlands | Правило | Схема |',
    '|---|---|---|---|',
    "| Я п'ю каву. | Ik drink koffie. | v2 | Ik (підмет) + drink (дієслово) + koffie (додаток) |",
    '| Я йду. | Ik ga. | v2 | Ik (підмет) + ga |',
    '| Я працюю. | Ik werk hard. | | |',
  ].join('\n');
  const result = parseSentenceMarkdown(markdown);
  assert.deepEqual(result.sentences.map(sentence => sentence.structure), [KOFFIE_STRUCTURE, null, null]);
  assert.deepEqual(result.warnings, [{ nl: 'Ik ga.', reason: 'схему не розібрано, речення додано без неї' }]);
  assert.deepEqual(result.errors, []);
});

test('parseSentenceMarkdown reads a table without a Схема column with no structure', () => {
  const markdown = '| Українською | Nederlands |\n|---|---|\n| Я п\'ю каву. | Ik drink koffie. |';
  const result = parseSentenceMarkdown(markdown);
  assert.equal(result.sentences[0].structure, null);
  assert.deepEqual(result.warnings, []);
});

test('normalizeRuleNames reads comma lists: trimmed, lower-cased, unknown names and repeats dropped', () => {
  assert.deepEqual(normalizeRuleNames([' V2 , none ', 'greeting', 'v2', 42, 'Perfect']), ['v2', 'none', 'perfect']);
  assert.deepEqual(normalizeRuleNames([' , ', '']), []);
  assert.deepEqual(normalizeRuleNames([]), []);
});


// ---------- several correct word orders ----------

const MARKT_NL = 'Morgen gaan we naar de markt.';
const MARKT_ALT = 'We gaan morgen naar de markt.';
const MARKT_STRUCTURE = [
  { text: 'Morgen', role: 'час' },
  { text: 'gaan', role: 'дієслово' },
  { text: 'we', role: 'підмет' },
  { text: 'naar de markt', role: 'місце' },
];

test('isSameWordMultiset compares the words with their counts, ignoring case, punctuation and apostrophe variants', () => {
  assert.equal(isSameWordMultiset(['Ik', 'drink', 'ik'], ['ik', 'ik', 'DRINK']), true);
  assert.equal(isSameWordMultiset(['ik', 'drink'], ['ik', 'drinkt']), false);
  assert.equal(isSameWordMultiset(['ik', 'ik', 'drink'], ['ik', 'drink']), false, 'the counts differ');
  assert.equal(isSameWordMultiset(splitIntoTiles("Het is 's avonds."), splitIntoTiles('het is ’s avonds')), true);
});

test('normalizeAltOrders keeps an alternative with the same words in another order, as written', () => {
  assert.deepEqual(normalizeAltOrders({ nl: MARKT_NL, altOrders: [MARKT_ALT] }), {
    altOrders: [MARKT_ALT],
    rejected: [],
  });
  assert.deepEqual(normalizeAltOrders({ nl: 'Ik drink koffie.', altOrders: ['Koffie, drink ik'] }).altOrders, [
    'Koffie, drink ik',
  ], 'a comma does not make another word');
});

test('normalizeAltOrders refuses a blank, other words, the main order and an earlier alternative', () => {
  const { altOrders, rejected } = normalizeAltOrders({
    nl: 'Ik drink koffie.',
    altOrders: ['  ', 'Ik drink thee.', 'Ik drink koffie nu.', 'ik DRINK koffie', 'Koffie drink ik.', 'koffie drink ik!'],
  });
  assert.deepEqual(altOrders, ['Koffie drink ik.']);
  assert.deepEqual(rejected, [
    { order: '', reason: 'порожній порядок' },
    { order: 'Ik drink thee.', reason: 'інші слова, ніж у реченні' },
    { order: 'Ik drink koffie nu.', reason: 'інші слова, ніж у реченні' },
    { order: 'ik DRINK koffie', reason: 'такий порядок уже є' },
    { order: 'koffie drink ik!', reason: 'такий порядок уже є' },
  ]);
});

test('normalizeAltOrders checks the schema: each segment contiguous and used once, in any order', () => {
  const structure = [{ text: 'Ik', role: 'підмет' }, { text: 'ik moe', role: 'додаток' }];
  const { altOrders, rejected } = normalizeAltOrders({
    nl: 'Ik ik moe.',
    altOrders: ['Ik moe ik.', 'Moe ik ik.', 'Ik ik moe!'],
    structure,
  });
  assert.deepEqual(altOrders, ['Ik moe ik.'], 'the segments share a word: the first try (Ik) fails, backtracking finds it');
  assert.deepEqual(rejected, [
    { order: 'Moe ik ik.', reason: 'не збігається зі схемою' },
    { order: 'Ik ik moe!', reason: 'такий порядок уже є' },
  ]);
  assert.deepEqual(normalizeAltOrders({ nl: 'Ik ik moe.', altOrders: ['Moe ik ik.'] }).altOrders, ['Moe ik ik.'],
    'without a schema the order is only checked for its words');
});

test('normalizeAltOrders breaks a segment that is split in the alternative', () => {
  const { altOrders, rejected } = normalizeAltOrders({
    nl: MARKT_NL,
    altOrders: ['Gaan we naar morgen de markt.', MARKT_ALT],
    structure: MARKT_STRUCTURE,
  });
  assert.deepEqual(altOrders, [MARKT_ALT]);
  assert.deepEqual(rejected, [{ order: 'Gaan we naar morgen de markt.', reason: 'не збігається зі схемою' }]);
});

test('normalizeAltOrders accepts an array of tiles, joined by spaces, and keeps at most five alternatives', () => {
  assert.deepEqual(normalizeAltOrders({ nl: MARKT_NL, altOrders: [['We', 'gaan', 'morgen', 'naar', 'de', 'markt']] })
    .altOrders, ['We gaan morgen naar de markt']);
  const altOrders = ['Nu drink ik koffie.', 'Koffie drink ik nu.', 'Nu koffie drink ik.', 'Koffie nu drink ik.',
    'Drink ik nu koffie.', 'Drink nu ik koffie.'];
  const result = normalizeAltOrders({ nl: 'Ik drink nu koffie.', altOrders });
  assert.equal(result.altOrders.length, 5);
  assert.deepEqual(result.rejected, [{ order: 'Drink nu ik koffie.', reason: 'забагато порядків' }]);
});

test('normalizeAltOrders reads no list, null or undefined as no alternatives', () => {
  assert.deepEqual(normalizeAltOrders({ nl: MARKT_NL }), { altOrders: [], rejected: [] });
  assert.deepEqual(normalizeAltOrders({ nl: MARKT_NL, altOrders: null }), { altOrders: [], rejected: [] });
  assert.deepEqual(normalizeAltOrders({ nl: MARKT_NL, altOrders: MARKT_ALT }), {
    altOrders: [],
    rejected: [{ order: '', reason: 'має бути списком рядків' }],
  });
});

test('listAcceptedOrders puts the main order first, and findMatchingOrderIndex finds the order an answer equals', () => {
  const orders = listAcceptedOrders({ nl: MARKT_NL, altOrders: [MARKT_ALT] });
  assert.deepEqual(orders, [splitIntoTiles(MARKT_NL), splitIntoTiles(MARKT_ALT)]);
  assert.equal(findMatchingOrderIndex({ answerTiles: ['Morgen', 'gaan', 'we', 'naar', 'de', 'markt'], orders }), 0);
  assert.equal(findMatchingOrderIndex({ answerTiles: ['we', 'gaan', 'MORGEN', 'naar', 'de', 'markt'], orders }), 1);
  assert.equal(findMatchingOrderIndex({ answerTiles: ['gaan', 'morgen', 'we', 'naar', 'de', 'markt'], orders }), -1);
  assert.deepEqual(listAcceptedOrders({ nl: MARKT_NL, altOrders: [] }), [splitIntoTiles(MARKT_NL)]);
});

test('parseStoredAltOrders reads the stored list of strings, and gives [] for NULL, junk or a non-list', () => {
  assert.deepEqual(parseStoredAltOrders(JSON.stringify([MARKT_ALT])), [MARKT_ALT]);
  assert.deepEqual(parseStoredAltOrders('[1,"x"]'), ['x']);
  assert.deepEqual(parseStoredAltOrders('[]'), []);
  assert.deepEqual(parseStoredAltOrders(null), []);
  assert.deepEqual(parseStoredAltOrders('{"a":1}'), []);
  assert.deepEqual(parseStoredAltOrders('не JSON'), []);
});

test('parseAlternativeOrdersText splits on a semicolon, and gives [] for an empty cell or a no-order value', () => {
  assert.deepEqual(parseAlternativeOrdersText('We gaan morgen naar de markt. ; Gaan we morgen naar de markt?'), [
    'We gaan morgen naar de markt.',
    'Gaan we morgen naar de markt?',
  ]);
  assert.deepEqual(parseAlternativeOrdersText('a;b'), ['a', 'b']);
  assert.deepEqual(parseAlternativeOrdersText('a ; '), ['a']);
  for (const value of ['—', '–', '-', '---', 'немає', 'None']) {
    assert.deepEqual(parseAlternativeOrdersText(value), []);
  }
  assert.deepEqual(parseAlternativeOrdersText('  '), []);
  assert.deepEqual(parseAlternativeOrdersText(undefined), []);
});

test('parseSentenceMarkdown reads the Інші порядки column into alt_orders, and gives each sentence its row number', () => {
  const markdown = [
    '| Українською | Nederlands | Правило | Схема | Інші порядки |',
    '|---|---|---|---|---|',
    `| Завтра ми йдемо на ринок. | ${MARKT_NL} | inversion | Morgen (час) + gaan (дієслово) + we (підмет) + naar de markt (місце) | ${MARKT_ALT} |`,
    "| Я п'ю каву. | Ik drink koffie. | v2 |  |  |",
  ].join('\n');
  const result = parseSentenceMarkdown(markdown);
  assert.deepEqual(result.sentences.map(sentence => sentence.alt_orders), [[MARKT_ALT], []]);
  assert.deepEqual(result.sentences.map(sentence => sentence.row), [1, 2]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('parseGeneratedSentences keeps the alt_orders the model wrote, or [] when there are none', () => {
  const sentences = parseGeneratedSentences(JSON.stringify({
    sentences: [
      { nl: MARKT_NL, uk: 'Завтра ми йдемо на ринок.', rule: 'inversion', alt_orders: [MARKT_ALT] },
      { nl: 'Ik drink koffie.', uk: "Я п'ю каву.", rule: 'v2' },
    ],
  }));
  assert.deepEqual(sentences.map(sentence => sentence.alt_orders), [[MARKT_ALT], []]);
});

test('add_sentences keeps any alt_orders value, and update_sentence takes a list of at most five strings', () => {
  const parsed = addSentencesInputSchema.parse({
    sentences: [
      { nl: 'Ik ga.', uk: 'Я йду.', alt_orders: 'Ga ik.' },
      { nl: 'Ik werk.', uk: 'Я працюю.', alt_orders: [MARKT_ALT] },
    ],
  });
  assert.equal(parsed.sentences[0].alt_orders, 'Ga ik.');
  assert.deepEqual(parsed.sentences[1].alt_orders, [MARKT_ALT]);
  assert.deepEqual(updateSentenceInputSchema.parse({ alt_orders: [] }), { alt_orders: [] });
  assert.equal(updateSentenceInputSchema.safeParse({ alt_orders: 'Ga ik.' }).success, false);
  assert.equal(updateSentenceInputSchema.safeParse({ alt_orders: [1] }).success, false);
  assert.equal(updateSentenceInputSchema.safeParse({ alt_orders: Array(6).fill(MARKT_ALT) }).success, false);
});
