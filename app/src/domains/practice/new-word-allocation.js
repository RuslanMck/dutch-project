// Chooses which New words enter rotation today, by priority quota, with unused slots going to P1, P2, P3. Within a set
// the topic caps apply: at most SET_CATEGORY_CAP words of one category and SET_EXPRESSION_CAP expressions. Pure.
import { FIRST_PRIORITY_OVERRIDE } from './priority-calculation.js';

const PRIORITIES_IN_ORDER = Object.freeze([1, 2, 3]);
export const SET_CATEGORY_CAP = 3;
export const SET_EXPRESSION_CAP = 2;
const EXPRESSION_KIND = 'expression';

// The tier quota for a block of blockSize items: each quota scales with blockSize / newPerDay and is rounded down, so a
// block of 10 keeps 7, 2, 1, a block of 20 gives 14, 4, 2, and the slots the rounding leaves go to P1, P2, P3 in
// allocateNewWords.
export function calculateNewWordAllowance({ newPerDay, tierQuota, blockSize }) {
  const scaledTierQuota = Object.freeze(Object.fromEntries(
    PRIORITIES_IN_ORDER.map(priority => [priority, Math.floor((tierQuota[priority] * blockSize) / newPerDay)]),
  ));
  return Object.freeze({ blockSize, scaledTierQuota });
}

// candidatesByPriority lists are already in queue order; a candidate is { id, priority, priorityOverride, category, kind }.
// The result lists P1 picks, then P2, then P3, each in queue order. Passes: the tier quotas, the unused slots in tier
// order, then the candidates the caps set aside, in queue order, so the caps never leave the set short. A word tagged
// «Вчити першим» ignores the caps and does not count toward them. A word without a category has no category cap.
export function allocateNewWords({ candidatesByPriority, introducedTodayByPriority, newPerDay, tierQuota }) {
  const introducedTodayCount = PRIORITIES_IN_ORDER.reduce(
    (total, priority) => total + (introducedTodayByPriority[priority] ?? 0),
    0,
  );
  let remainingSlotCount = Math.max(0, newPerDay - introducedTodayCount);
  const tierByPriority = Object.fromEntries(PRIORITIES_IN_ORDER.map(priority => [
    priority,
    createTierState(candidatesByPriority[priority] ?? []),
  ]));
  const setCounts = { countByCategory: new Map(), expressionCount: 0 };

  for (const priority of PRIORITIES_IN_ORDER) {
    const quotaLeftCount = Math.max(0, tierQuota[priority] - (introducedTodayByPriority[priority] ?? 0));
    remainingSlotCount -= takeCandidates({
      tier: tierByPriority[priority],
      limitCount: Math.min(quotaLeftCount, remainingSlotCount),
      setCounts,
      isCapped: true,
    });
  }

  for (const priority of PRIORITIES_IN_ORDER) {
    remainingSlotCount -= takeCandidates({
      tier: tierByPriority[priority],
      limitCount: remainingSlotCount,
      setCounts,
      isCapped: true,
    });
  }

  for (const priority of PRIORITIES_IN_ORDER) {
    remainingSlotCount -= takeSetAsideCandidates({
      tier: tierByPriority[priority],
      limitCount: remainingSlotCount,
      setCounts,
    });
  }

  return PRIORITIES_IN_ORDER.flatMap(priority => {
    const tier = tierByPriority[priority];
    return tier.candidates.filter((candidate, candidateIndex) => tier.pickedIndexes.has(candidateIndex));
  });
}

function createTierState(candidates) {
  return { candidates, nextIndex: 0, setAsideIndexes: [], pickedIndexes: new Set() };
}

// Takes up to limitCount candidates from the tier's next position on. With isCapped, a candidate over a cap is set
// aside for the last pass. Returns how many were taken.
function takeCandidates({ tier, limitCount, setCounts, isCapped }) {
  let takenCount = 0;
  while (takenCount < limitCount && tier.nextIndex < tier.candidates.length) {
    const candidateIndex = tier.nextIndex;
    tier.nextIndex += 1;
    if (isCapped && isOverSetCap(tier.candidates[candidateIndex], setCounts)) {
      tier.setAsideIndexes.push(candidateIndex);
      continue;
    }
    recordPick(tier, candidateIndex, setCounts);
    takenCount += 1;
  }
  return takenCount;
}

// Takes up to limitCount of the tier's set-aside candidates in queue order, caps ignored.
function takeSetAsideCandidates({ tier, limitCount, setCounts }) {
  const takenIndexes = tier.setAsideIndexes.splice(0, limitCount);
  for (const candidateIndex of takenIndexes) recordPick(tier, candidateIndex, setCounts);
  return takenIndexes.length;
}

function isOverSetCap(candidate, setCounts) {
  if (candidate.priorityOverride === FIRST_PRIORITY_OVERRIDE) return false;
  if (candidate.category && (setCounts.countByCategory.get(candidate.category) ?? 0) >= SET_CATEGORY_CAP) return true;
  return candidate.kind === EXPRESSION_KIND && setCounts.expressionCount >= SET_EXPRESSION_CAP;
}

function recordPick(tier, candidateIndex, setCounts) {
  tier.pickedIndexes.add(candidateIndex);
  const candidate = tier.candidates[candidateIndex];
  if (candidate.priorityOverride === FIRST_PRIORITY_OVERRIDE) return;
  if (candidate.category) {
    setCounts.countByCategory.set(candidate.category, (setCounts.countByCategory.get(candidate.category) ?? 0) + 1);
  }
  if (candidate.kind === EXPRESSION_KIND) setCounts.expressionCount += 1;
}
