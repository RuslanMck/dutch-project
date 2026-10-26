// The intake block: the New items (words or phrases) offered together. A block opens when its first item is started,
// pinning the items allocated at that moment. It stays open until every pinned item is started or deleted, across
// days: its leftovers are the only new items on offer meanwhile. Pure.

// The block as it is saved in the practice settings: { opened_on, item_ids, extra_count }. A block saved before items
// were pinned (no item_ids) reads as finished, with no items; one saved before extra_count has no extra words.
export function mapFromStoredBlock(storedBlock) {
  if (!storedBlock) return null;
  const itemIds = Array.isArray(storedBlock.item_ids) ? storedBlock.item_ids : [];
  const extraCount = Number.isInteger(storedBlock.extra_count) ? storedBlock.extra_count : 0;
  return Object.freeze({ openedOn: storedBlock.opened_on, itemIds: Object.freeze([...itemIds]), extraCount });
}

export function mapToStoredBlock(block) {
  return { opened_on: block.openedOn, item_ids: [...block.itemIds], extra_count: block.extraCount };
}

// A block opened today that pins the given items. extraCount is how many of them are extra new words (0 by default).
export function openIntakeBlock({ today, itemIds, extraCount = 0 }) {
  return Object.freeze({ openedOn: today, itemIds: Object.freeze([...itemIds]), extraCount });
}

// storedBlock: { openedOn, itemIds, extraCount } or null. newItemIds: the ids still New (no card); a pinned item that
// is not in it (started, or deleted) counts as done. Returns { openedOn, itemIds, extraCount, leftoverIds, isFresh }.
// A stored block stays open while it has leftovers, and also when it was opened today, so the day's extra words can
// follow it. Otherwise no block is open: isFresh is true, extraCount is 0 and the caller allocates the day's count,
// pinned on the first start.
export function resolveIntakeBlock({ storedBlock, today, newItemIds }) {
  if (storedBlock) {
    const leftoverIds = storedBlock.itemIds.filter(itemId => newItemIds.has(itemId));
    if (leftoverIds.length > 0 || storedBlock.openedOn === today) {
      return Object.freeze({
        openedOn: storedBlock.openedOn,
        itemIds: storedBlock.itemIds,
        extraCount: storedBlock.extraCount,
        leftoverIds: Object.freeze(leftoverIds),
        isFresh: false,
      });
    }
  }
  return Object.freeze({
    openedOn: today,
    itemIds: Object.freeze([]),
    extraCount: 0,
    leftoverIds: Object.freeze([]),
    isFresh: true,
  });
}

// The extra new words added today: the block's extraCount when it was opened today, 0 otherwise.
export function countExtraItemsToday({ block, today }) {
  return block.openedOn === today ? block.extraCount : 0;
}
