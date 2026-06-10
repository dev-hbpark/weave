import { useEffect, useMemo, useRef } from "react";
import {
  CULL_ROOT_MARGIN,
  type ViewportCullRegistry,
} from "../../document/interactions/viewport-cull-context.js";

// DR-027 / WI-071 Phase 3 — viewport culling registry (WI-058 / DR-021)
// extracted from FrameStage. One IntersectionObserver rooted at the
// viewport-clipping element; frames register their wrapper via the returned
// registry and the observer flips their `visibility` by ref-mutation (no
// re-render). Armed per the editor mode's ViewPolicy.viewportCulling (WI-166)
// — page-chrome flavors fit the viewport so nothing is ever off-screen to cull.

export function useViewportCulling(
  enabled: boolean,
  outerRef: React.RefObject<HTMLElement | null>,
): ViewportCullRegistry | null {
  const cullCallbacks = useRef(new Map<Element, (visible: boolean) => void>());
  const cullObserver = useRef<IntersectionObserver | null>(null);
  // DEV-only A/B escape hatch (WI-058 perf measurement). `window.__weaveDisableCull`
  // turns culling off for a baseline at identical geometry; DEV-gated per the
  // `window.__weave*` dev-globals rule (apps/web/CLAUDE.md).
  const cullEnabled =
    enabled &&
    !(
      import.meta.env.DEV &&
      (globalThis as { __weaveDisableCull?: boolean }).__weaveDisableCull === true
    );
  useEffect(() => {
    if (!cullEnabled) return;
    const root = outerRef.current;
    if (root === null) return;
    // Pre-render buffer (WI-058 2b). Half a viewport each side keeps the working
    // set tight while pre-rendering a frame before it reaches the edge;
    // `__weaveCullMargin` overrides it in DEV for the margin sweep.
    const rootMargin =
      (import.meta.env.DEV && (globalThis as { __weaveCullMargin?: string }).__weaveCullMargin) ||
      CULL_ROOT_MARGIN;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          cullCallbacks.current.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root, rootMargin, threshold: 0 },
    );
    cullObserver.current = io;
    // Pick up frames that registered before this effect ran (child effects fire
    // before the parent's on the same commit).
    for (const el of cullCallbacks.current.keys()) io.observe(el);
    return () => {
      io.disconnect();
      cullObserver.current = null;
    };
  }, [cullEnabled, outerRef]);
  return useMemo<ViewportCullRegistry | null>(() => {
    if (!cullEnabled) return null;
    return {
      observe(el, onChange) {
        cullCallbacks.current.set(el, onChange);
        cullObserver.current?.observe(el);
        return () => {
          cullCallbacks.current.delete(el);
          cullObserver.current?.unobserve(el);
        };
      },
    };
  }, [cullEnabled]);
}
