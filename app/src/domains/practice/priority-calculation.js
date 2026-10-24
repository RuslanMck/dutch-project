// Practice priority rules, frequency lookup and queue order for New words. Pure: no I/O.
const PRIORITY_VALUES = Object.freeze([1, 2, 3]);
const P1_FREQUENCY_RANK_LIMIT = 2000;
const P2_FREQUENCY_RANK_LIMIT = 5000;
const LEADING_ARTICLE_PATTERN = /^(de|het)\s+/;
const CURLY_APOSTROPHE_PATTERN = /[‘’]/g;
// Apostrophes are not punctuation here: "zo'n" and "'s ochtends" keep them. They are trimmed only on a second lookup.
const PUNCTUATION_PATTERN = /[?!.,;:()"…]/g;
const EDGE_APOSTROPHE_PATTERN = /^'+|'+$/g;
const NUMBER_PATTERN = /^\d+$/;

// The integer before the first dot of a section code: '6.1' → 6, '6' → 6, 'Д1' → null.
export function parseChapterNumber(sectionCode) {
  const match = /^(\d+)(?:\.|$)/.exec(String(sectionCode ?? '').trim());
  return match ? Number(match[1]) : null;
}

// A manual override wins. Otherwise the current or previous chapter is P1, then frequency rank decides.
export function calculatePriority({ priorityOverride, chapterNumber, frequencyRank, currentChapter }) {
  if (PRIORITY_VALUES.includes(priorityOverride)) return priorityOverride;
  if (chapterNumber === currentChapter || chapterNumber === currentChapter - 1) return 1;
  if (typeof frequencyRank !== 'number') return 3;
  if (frequencyRank <= P1_FREQUENCY_RANK_LIMIT) return 1;
  if (frequencyRank <= P2_FREQUENCY_RANK_LIMIT) return 2;
  return 3;
}

// Sort comparator: priority, then chapter (none last), then frequency rank (unranked last), then id.
// Inside one priority this is the queue order.
export function compareQueueOrder(first, second) {
  return (
    compareAscendingNullLast(first.priority, second.priority) ||
    compareAscendingNullLast(first.chapterNumber, second.chapterNumber) ||
    compareAscendingNullLast(first.frequencyRank, second.frequencyRank) ||
    compareAscendingNullLast(first.id, second.id)
  );
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

function compareAscendingNullLast(first, second) {
  const isFirstMissing = first === null || first === undefined;
  const isSecondMissing = second === null || second === undefined;
  if (isFirstMissing && isSecondMissing) return 0;
  if (isFirstMissing) return 1;
  if (isSecondMissing) return -1;
  return first - second;
}
