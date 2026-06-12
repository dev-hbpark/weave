// WI-198 — latest-ref callback stabilizer for the NestedFrame hot-path
// contract.
//
// `React.memo(NestedFrame)` bounds drag-tick reconciliation to the dragged
// item's ancestor path — but only while every function prop is identity-
// stable across document ticks. FrameStage's callers (DesignPage) pass a
// mix of inline lambdas and plain functions, all of which get a new
// identity on every host render. Rather than chase caller hygiene,
// FrameStage owns the contract: every function prop is run through this
// hook before reaching NestedFrame.
//
// The returned wrapper's identity depends ONLY on the prop's defined-ness
// (NestedFrame branches on `onX !== undefined` to decide whether an
// affordance exists at all), while calls always forward to the LATEST
// underlying callback via a ref — the same latest-ref pattern as
// `onCommitFrameRef` / `visibleFrameIdsRef` elsewhere in FrameStage.

import { useMemo, useRef } from "react";

/** Stabilize an optional callback prop: identity changes only when the prop
 *  flips between defined and undefined; invocations always reach the latest
 *  value. Do NOT use for functions whose RETURN VALUE feeds render output
 *  of a memoized child and must trigger re-render on change — those need
 *  real deps (see `wrappedRenderFrameMenu`, which keys on `pickerCtx`). */
export function useStableHandler<A extends ReadonlyArray<unknown>, R>(
  fn: ((...args: A) => R) | undefined,
): ((...args: A) => R) | undefined {
  const ref = useRef(fn);
  ref.current = fn;
  const defined = fn !== undefined;
  return useMemo(() => {
    if (!defined) return undefined;
    return (...args: A): R => {
      const current = ref.current;
      if (current === undefined) {
        // Defined-ness flipped within the same commit window — treat as a
        // no-op rather than crash; the next render re-keys the wrapper.
        return undefined as R;
      }
      return current(...args);
    };
  }, [defined]);
}
