// WI-183 — Enter-to-edit registry. The editor-level Enter hotkey (DesignPage)
// asks "can the selected item enter text edit?" WITHOUT a kind compare
// (Rule 6): each editable text surface registers its own enter-edit callback
// while mounted, and the hotkey just triggers by item id. A non-text item has
// no registration → `trigger` returns false → Enter falls through untouched.
//
// Same module-level singleton idiom as `cropping-state.ts` (synchronous reads
// for imperative keydown gates).

type EnterEditFn = () => void;

const handlers = new Map<string, EnterEditFn>();

export const textEditTrigger = {
  /** Register an enter-edit callback for an item. Returns the unregister fn
   *  (guarded — a stale unmount can't evict a newer registration). */
  register(itemId: string, fn: EnterEditFn): () => void {
    handlers.set(itemId, fn);
    return () => {
      if (handlers.get(itemId) === fn) handlers.delete(itemId);
    };
  },
  /** Enter edit on the item's text surface. True when a surface claimed it
   *  (the caller then preventDefaults the key). */
  trigger(itemId: string): boolean {
    const fn = handlers.get(itemId);
    if (fn === undefined) return false;
    fn();
    return true;
  },
};
