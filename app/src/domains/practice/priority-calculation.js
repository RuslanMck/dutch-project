// Practice priority rules, frequency lookup and queue order for New words. Pure: no I/O.
const PRIORITY_VALUES = Object.freeze([1, 2, 3]);
const P1_EFFECTIVE_RANK_LIMIT = 2000;
const P2_EFFECTIVE_RANK_LIMIT = 5000;
// A word of the current or the previous chapter counts as twice as common: its frequency rank is halved.
const LESSON_WORD_RANK_FACTOR = 0.5;
const LEADING_ARTICLE_PATTERN = /^(de|het)\s+/;
const CURLY_APOSTROPHE_PATTERN = /[‘’]/g;
// Apostrophes are not punctuation here: "zo'n" and "'s ochtends" keep them. They are trimmed only on a second lookup.
const PUNCTUATION_PATTERN = /[?!.,;:()"…]/g;
const EDGE_APOSTROPHE_PATTERN = /^'+|'+$/g;
const NUMBER_PATTERN = /^\d+$/;
// The manual tags of the learner: 'first' is the override 1 («Вчити першим»), 'later' the override 3 («Пізніше»).
// The override 2 is valid for MCP only: it has no tag.
export const PRIORITY_TAG_VALUES = Object.freeze(['first', 'later']);
export const FIRST_PRIORITY_OVERRIDE = 1;
const LATER_PRIORITY_OVERRIDE = 3;
// Settings marker: the version of these rules the stored priorities were calculated with.
export const PRIORITY_RULES_VERSION = 2;

// The integer before the first dot of a section code: '6.1' → 6, '6' → 6, 'Д1' → null.
export function parseChapterNumber(sectionCode) {
  const match = /^(\d+)(?:\.|$)/.exec(String(sectionCode ?? '').trim());
  return match ? Number(match[1]) : null;
}

// The rank a word is ordered by: its frequency rank, halved for a word of the current or the previous chapter. Null
// when the word is unranked.
export function calculateEffectiveRank({ frequencyRank, chapterNumber, currentChapter }) {
  if (typeof frequencyRank !== 'number') return null;
  return isNearCurrentChapter(chapterNumber, currentChapter) ? frequencyRank * LESSON_WORD_RANK_FACTOR : frequencyRank;
}

// A manual override wins. Otherwise the effective rank decides: P1 up to 2000, P2 up to 5000, P3 beyond or unranked.
export function calculatePriority({ priorityOverride, chapterNumber, frequencyRank, currentChapter }) {
  if (PRIORITY_VALUES.includes(priorityOverride)) return priorityOverride;
  const effectiveRank = calculateEffectiveRank({ frequencyRank, chapterNumber, currentChapter });
  if (effectiveRank === null) return 3;
  if (effectiveRank <= P1_EFFECTIVE_RANK_LIMIT) return 1;
  if (effectiveRank <= P2_EFFECTIVE_RANK_LIMIT) return 2;
  return 3;
}

// Sort comparator: priority, then the words tagged «Вчити першим» first, then effective rank (unranked last), then id.
// Inside one priority this is the queue order. Entries: { id, priority, priorityOverride, effectiveRank }.
export function compareQueueOrder(first, second) {
  return (
    compareAscendingNullLast(first.priority, second.priority) ||
    compareFirstTagged(first, second) ||
    compareAscendingNullLast(first.effectiveRank, second.effectiveRank) ||
    compareAscendingNullLast(first.id, second.id)
  );
}

// The manual tag of a priority override: 1 → 'first', 3 → 'later', anything else (none, 2) → null.
export function mapPriorityOverrideToTag(priorityOverride) {
  if (priorityOverride === FIRST_PRIORITY_OVERRIDE) return 'first';
  return priorityOverride === LATER_PRIORITY_OVERRIDE ? 'later' : null;
}

// The override a manual tag stands for: 'first' → 1, 'later' → 3, null → null (automatic).
export function mapPriorityTagToOverride(priorityTag) {
  if (priorityTag === 'first') return FIRST_PRIORITY_OVERRIDE;
  return priorityTag === 'later' ? LATER_PRIORITY_OVERRIDE : null;
}

// Whether the chapter is the current one or the one before it.
export function isNearCurrentChapter(chapterNumber, currentChapter) {
  return chapterNumber === currentChapter || chapterNumber === currentChapter - 1;
}

// Rank of the Dutch text: a single form's rank, or for several forms the largest (rarest) rank.
// Null when any form is missing from the list. A leading 'de' or 'het' is ignored, and so are numbers ('voor 2').
// Each form is looked up as it is, then without leading and trailing apostrophes ("'s" → "s").
// Names in expressions are not ranked: a name missing from the list leaves the whole expression unranked.
export function calculateFrequencyRank(dutchText, findRankByForm) {
  const normalizedText = String(dutchText ?? '')
    .toLowerCase()
    .replace(CURLY_APOSTROPHE_PATTERN, "'")
    .trim()
    .replace(LEADING_ARTICLE_PATTERN, '')
    .replace(PUNCTUATION_PATTERN, ' ');
  const forms = normalizedText.split(/\s+/).filter(form => form.length > 0 && !NUMBER_PATTERN.test(form));
  if (forms.length === 0) return null;
  const ranks = forms.map(form => findRankOfForm(form, findRankByForm));
  if (ranks.some(rank => typeof rank !== 'number')) return null;
  return Math.max(...ranks);
}

// The rank of the form as it is, or of the form without its leading and trailing apostrophes; null when neither.
function findRankOfForm(form, findRankByForm) {
  const exactRank = findRankByForm(form);
  if (typeof exactRank === 'number') return exactRank;
  const trimmedForm = form.replace(EDGE_APOSTROPHE_PATTERN, '');
  return trimmedForm.length > 0 && trimmedForm !== form ? findRankByForm(trimmedForm) : null;
}

// A word tagged «Вчити першим» sorts before one that is not.
function compareFirstTagged(first, second) {
  const isFirstTagged = first.priorityOverride === FIRST_PRIORITY_OVERRIDE;
  const isSecondTagged = second.priorityOverride === FIRST_PRIORITY_OVERRIDE;
  return Number(isSecondTagged) - Number(isFirstTagged);
}

function compareAscendingNullLast(first, second) {
  const isFirstMissing = first === null || first === undefined;
  const isSecondMissing = second === null || second === undefined;
  if (isFirstMissing && isSecondMissing) return 0;
  if (isFirstMissing) return 1;
  if (isSecondMissing) return -1;
  return first - second;
}
