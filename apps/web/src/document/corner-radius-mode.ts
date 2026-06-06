// Ephemeral per-item corner-radius edit MODE (WI-109).
//
// "uniform" → the on-canvas handle shows ONE grip (top-right) that drives all
// four corners together. "split" → four grips, one per corner, independently
// draggable. Double-clicking a grip toggles the mode (see corner-radius-handle).
//
// The mode is transient UI state (like crop mode), NOT document state: the
// per-corner VALUES persist in attrs, but how many grips are shown does not
// need to survive a reload. The default for a freshly-selected item is derived
// from its data (non-uniform radii → start split), so reopening a doc with
// rounded-per-corner content still shows four grips.

export type CornerRadiusMode = "uniform" | "split";

const modeByItem = new Map<string, CornerRadiusMode>();
const listeners = new Set<() => void>();

export const cornerRadiusModeStore = {
  /** Explicit mode for `itemId`, or `undefined` when none was set (caller
   *  falls back to the data-derived default). Stable primitive → safe as a
   *  `useSyncExternalStore` snapshot. */
  peek(itemId: string): CornerRadiusMode | undefined {
    return modeByItem.get(itemId);
  },
  set(itemId: string, mode: CornerRadiusMode): void {
    if (modeByItem.get(itemId) === mode) return;
    modeByItem.set(itemId, mode);
    for (const l of listeners) l();
  },
  clear(itemId: string): void {
    if (modeByItem.delete(itemId)) for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
