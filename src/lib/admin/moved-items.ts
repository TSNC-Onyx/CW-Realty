// Reordering a list on screen (drag and drop, Move earlier / Move later) before the server
// confirms it (docs/admin-upload-layout-plan.md).

type MoveOptions = { from: number; to: number };

function isInRange<Item>(items: readonly Item[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < items.length;
}

/** A copy of items with the one at from placed at to; out-of-range moves return the list unchanged. */
export function getMovedItems<Item>(items: readonly Item[], { from, to }: MoveOptions): Item[] {
  if (from === to || !isInRange(items, from) || !isInRange(items, to)) return [...items];
  const moved = [...items];
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item as Item);
  return moved;
}
