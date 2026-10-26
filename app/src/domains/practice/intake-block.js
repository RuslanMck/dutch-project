// The intake block: the new items (words or phrases) opened for practice at one time. A block stays open until every
// item in it has been started (first graded), across days if needed: an unfinished block from an earlier day keeps
// offering only its leftovers, and a new block opens only once it is finished. A block remembers how many items had
// been started when it opened, so items of an earlier block never count against it. Pure.

// storedBlock: { openedOn, size, introducedAtOpen } or null. introducedTotals: the items started so far, by group (word
// priorities 1–3, or one group for phrases). Returns { openedOn, size, introducedAtOpen, introducedByGroup,
// introducedCount, isStored }: the stored block while it is unfinished or was opened today, otherwise a fresh block of
// perDayCount opened today (isStored false until it is saved).
export function resolveIntakeBlock({ storedBlock, today, perDayCount, introducedTotals }) {
  if (storedBlock) {
    const introducedByGroup = subtractCounts(introducedTotals, storedBlock.introducedAtOpen);
    const introducedCount = sumCounts(introducedByGroup);
    if (introducedCount < storedBlock.size || storedBlock.openedOn === today) {
      return Object.freeze({ ...storedBlock, introducedByGroup, introducedCount, isStored: true });
    }
  }
  return Object.freeze({
    openedOn: today,
    size: perDayCount,
    introducedAtOpen: { ...introducedTotals },
    introducedByGroup: subtractCounts(introducedTotals, introducedTotals),
    introducedCount: 0,
    isStored: false,
  });
}

// The block as it is saved in the practice settings.
export function mapToStoredBlock(block) {
  return { opened_on: block.openedOn, size: block.size, introduced_at_open: block.introducedAtOpen };
}

// Never below zero: a reset or a word set back to new lowers the totals.
function subtractCounts(totals, countsAtOpen) {
  return Object.fromEntries(Object.entries(totals)
    .map(([group, total]) => [group, Math.max(0, total - (countsAtOpen?.[group] ?? 0))]));
}

function sumCounts(countByGroup) {
  return Object.values(countByGroup).reduce((total, count) => total + count, 0);
}
