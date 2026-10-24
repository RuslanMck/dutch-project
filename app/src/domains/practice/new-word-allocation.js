// Chooses which New words enter rotation today, by priority quota, with unused slots going to P1, P2, P3. Pure.
const PRIORITIES_IN_ORDER = Object.freeze([1, 2, 3]);

// candidatesByPriority lists are already in queue order. The result lists P1 picks, then P2, then P3.
export function allocateNewWords({ candidatesByPriority, introducedTodayByPriority, newPerDay, tierQuota }) {
  const introducedTodayCount = PRIORITIES_IN_ORDER.reduce(
    (total, priority) => total + (introducedTodayByPriority[priority] ?? 0),
    0,
  );
  let remainingSlotCount = Math.max(0, newPerDay - introducedTodayCount);
  const pickCountByPriority = {};

  for (const priority of PRIORITIES_IN_ORDER) {
    const availableCount = (candidatesByPriority[priority] ?? []).length;
    const quotaLeftCount = Math.max(0, tierQuota[priority] - (introducedTodayByPriority[priority] ?? 0));
    pickCountByPriority[priority] = Math.min(quotaLeftCount, availableCount, remainingSlotCount);
    remainingSlotCount -= pickCountByPriority[priority];
  }

  for (const priority of PRIORITIES_IN_ORDER) {
    const availableCount = (candidatesByPriority[priority] ?? []).length;
    const extraCount = Math.min(availableCount - pickCountByPriority[priority], remainingSlotCount);
    pickCountByPriority[priority] += extraCount;
    remainingSlotCount -= extraCount;
  }

  return PRIORITIES_IN_ORDER.flatMap(priority =>
    (candidatesByPriority[priority] ?? []).slice(0, pickCountByPriority[priority]),
  );
}
