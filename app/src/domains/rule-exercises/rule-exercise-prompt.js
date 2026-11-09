// Builds the chat messages that ask the LLM for new rule exercises, and reads its JSON answer. Pure.
// Variety comes from three things: the learner's own words, a few random everyday situations per request, and the
// list of sentences already saved for these rules, which must not be repeated.
import { ValidationError } from '../../errors/domain-errors.js';

const MAXIMUM_EXISTING_SENTENCES = 150;
const MAXIMUM_RULE_BODY_LENGTH = 3000;
const SITUATION_COUNT = 3;
const MAXIMUM_TEXT_LENGTH = 600;
const MAXIMUM_ANSWER_LENGTH = 120;
const MINIMUM_OPTION_COUNT = 2;
const MAXIMUM_OPTION_COUNT = 4;
const GAP = '___';
const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

export const SITUATIONS = Object.freeze([
  'у кафе чи ресторані', 'у магазині', 'на роботі', 'у школі чи на курсах', 'удома з родиною', 'у гостях у друзів',
  'у лікаря', 'на вокзалі чи в поїзді', 'у місті, як пройти', 'погода і пори року', 'хобі та спорт', 'свята і дні народження',
  'покупки одягу', 'квартира й переїзд', 'вихідні та плани', 'подорож і готель', 'їжа та приготування', 'тварини',
  'телефонна розмова', 'сусіди', 'ринок', 'бібліотека', 'велосипед і транспорт', 'кіно та музика',
]);

const SYSTEM_PROMPT = [
  'You write short grammar exercises in Dutch for a Ukrainian learner at level A1-A2. Each exercise trains ONE of the',
  'rules the user gives (the rule text is the learner\'s own Ukrainian summary; follow it).',
  '',
  'Two kinds:',
  '- "gap": a Dutch sentence with exactly one gap written as ___ . The learner types what goes there (one word or a',
  '  short form, e.g. "mooie", "het", "grootste", "zijn", "deze"). Put the base form or the needed hint in "hint"',
  '  when the learner must change a word (e.g. hint "mooi" for answer "mooie"); null when the task is to choose a word',
  '  (an article, a pronoun). "accepted_answers" lists EVERY other answer that is also right in standard Dutch',
  '  (deze and die, dit and dat, omdat and want, both verb orders at the end of a subclause, …); [] only when',
  '  exactly one answer fits. Check this for each gap: a right answer the learner types must never count as wrong.',
  '  The hint is the base form to change or a short meaning, never the answer itself when the task is to choose.',
  '- "choice": 2 to 4 options and EXACTLY ONE of them is right in standard Dutch; check every other option is really',
  '  wrong (e.g. do not offer both deze and die when nothing in the sentence decides). The sentence has one ___ gap,',
  '  or is "" when the question asks to pick the right whole sentence (then the options are whole sentences; use this',
  '  for word order).',
  '- Demonstratives (deze/die/dit/dat): a choice or a gap with a single answer needs a word that decides near or far',
  '  (hier, daar, «тут», «он там» in the question); otherwise accept both (deze and die, dit and dat).',
  '',
  'Rules:',
  '- Mix the kinds (about half each) and vary what is asked inside a rule: for adjectives de/het/een/plural/after the',
  '  verb; for articles definite/indefinite/none; for verbs every person; for plurals -en/-s/-\'s and vowel changes;',
  '  and so on. Never ask the same thing twice in one answer.',
  '- Every sentence is new: different subjects, verbs, places and situations; use the situations the user gives, and',
  '  prefer the learner\'s known words. Do not reuse or slightly change a sentence from the "already used" list.',
  '- Sentences are natural, 4 to 12 words, correct Dutch, no names of real people.',
  '- "question" is the task in Ukrainian, short and specific to this sentence, e.g. «Встав прикметник у правильній',
  '  формі», «Обери правильний артикль», «Яке речення має правильний порядок слів?». Vary the wording.',
  '- "translation" is a natural Ukrainian translation of the full right sentence (for a whole-sentence choice: of the',
  '  right option).',
  '- "explanation": 1 or 2 Ukrainian sentences: why this answer is right, naming the rule code in brackets, e.g.',
  '  «het-слово в однині після een — прикметник без -e (5.5)». For a choice, say why the tempting wrong option is wrong.',
  '- All Ukrainian is correct literary Ukrainian: no Russian words, russianisms, calques or surzhyk, with the right',
  '  gender agreement (цей фільм, ця ятка). Use these forms: «стоїть на другому місці» (not «ставиться»), «ідеться про»',
  '  (not «мається на увазі»), «має вигляд» (not «виглядає»), «розташований» or «є» (not «знаходиться»), «цей» (not',
  '  «даний»), «неозначений / означений артикль», «правильно» (not «вірно»).',
  '- Plain text only: no markdown (**, *), no LaTeX or formulas; write an arrow as →.',
  '',
  'Answer with a JSON object only, no text before or after it:',
  '{"exercises":[{"rule_code":"5.5","kind":"gap","question":"...","sentence":"Ik heb een ___ fiets.","hint":"nieuw",',
  '"answer":"nieuwe","accepted_answers":[],"options":null,"translation":"...","explanation":"..."}]}',
  'The array has exactly the number of items the user asks for, spread over the rules as the user says.',
].join('\n');

// rules: [{ code, title, body }]; countsByRuleCode: how many exercises per rule; knownWords, otherWords: Dutch words;
// existingSentences: [{ rule_code, sentence, answer }] already saved; situations: Ukrainian topics to set the scene.
export function buildRuleExerciseMessages({ rules, countsByRuleCode, knownWords = [], otherWords = [],
  existingSentences = [], situations = [] }) {
  const ruleText = rules.map(rule => [
    `### Rule ${rule.code}: ${rule.title} — write ${countsByRuleCode[rule.code]} exercise(s)`,
    String(rule.body).slice(0, MAXIMUM_RULE_BODY_LENGTH),
  ].join('\n')).join('\n\n');
  const usedText = existingSentences.slice(0, MAXIMUM_EXISTING_SENTENCES)
    .map(item => `- [${item.rule_code}] ${item.sentence || '(choice of sentences)'} → ${item.answer}`).join('\n');
  const total = Object.values(countsByRuleCode).reduce((sum, count) => sum + count, 0);
  const content = [
    `Write ${total} exercises.`,
    '',
    ruleText,
    '',
    `Situations for this batch: ${situations.join('; ')}.`,
    `Learner's known words: ${knownWords.join(', ') || '(none yet)'}`,
    `Other words they have seen: ${otherWords.join(', ') || '(none)'}`,
    '',
    'Already used (do not repeat these sentences):',
    usedText || '(none)',
  ].join('\n');
  return Object.freeze([
    Object.freeze({ role: 'system', content: SYSTEM_PROMPT }),
    Object.freeze({ role: 'user', content }),
  ]);
}

// Picks count different situations at random.
export function pickSituations(random, count = SITUATION_COUNT) {
  const pool = [...SITUATIONS];
  const picked = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked;
}

// Returns { exercises, skipped }: the valid exercises (rule_code among ruleCodes) in a clean shape, and how many were
// dropped. Throws ValidationError when the answer has no exercises array.
export function parseGeneratedRuleExercises(responseText, { ruleCodes }) {
  const parsedAnswer = parseJsonObject(responseText);
  if (!Array.isArray(parsedAnswer.exercises)) throw new ValidationError('у відповіді моделі немає масиву exercises');
  const exercises = [];
  for (const candidate of parsedAnswer.exercises) {
    const exercise = toRuleExercise(candidate, ruleCodes);
    if (exercise) exercises.push(exercise);
  }
  return { exercises, skipped: parsedAnswer.exercises.length - exercises.length };
}

function toRuleExercise(candidate, ruleCodes) {
  if (!candidate || typeof candidate !== 'object') return null;
  const ruleCode = cleanText(candidate.rule_code);
  const kind = candidate.kind;
  const question = cleanText(candidate.question);
  const sentence = cleanText(candidate.sentence).replace(/_{2,}/g, GAP);
  const answer = cleanText(candidate.answer);
  const explanation = cleanText(candidate.explanation);
  if (!ruleCodes.includes(ruleCode) || !['gap', 'choice'].includes(kind)) return null;
  if (!question || !answer || !explanation || answer.length > MAXIMUM_ANSWER_LENGTH) return null;
  if ([question, sentence, explanation].some(text => text.length > MAXIMUM_TEXT_LENGTH)) return null;
  const gapCount = sentence.split(GAP).length - 1;
  let options = null;
  if (kind === 'gap') {
    if (gapCount !== 1) return null;
  } else {
    if (gapCount > 1 || (gapCount === 0 && sentence !== '')) return null;
    options = Array.isArray(candidate.options) ? [...new Set(candidate.options.map(cleanText).filter(Boolean))] : [];
    if (options.length < MINIMUM_OPTION_COUNT || options.length > MAXIMUM_OPTION_COUNT) return null;
    if (!options.includes(answer)) return null;
  }
  const acceptedAnswers = kind === 'gap' && Array.isArray(candidate.accepted_answers)
    ? [...new Set(candidate.accepted_answers.map(cleanText).filter(text => text && text !== answer))]
    : [];
  return {
    rule_code: ruleCode,
    kind,
    question,
    sentence,
    hint: kind === 'gap' ? cleanText(candidate.hint) || null : null,
    answer,
    accepted_answers: acceptedAnswers,
    options,
    translation: cleanText(candidate.translation) || null,
    explanation,
  };
}

// Plain text for the page: LaTeX arrows ($\rightarrow$, \to) become →, markdown ** is dropped, spaces collapse.
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\$?\\(?:rightarrow|to)\$?/g, '→')
    .replace(/\*\*/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseJsonObject(responseText) {
  const text = String(responseText ?? '');
  const fenced = text.match(JSON_FENCE_PATTERN);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* falls through */ }
  throw new ValidationError('відповідь моделі — не JSON-об\'єкт');
}
