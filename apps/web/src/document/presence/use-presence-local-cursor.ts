// WI-028 Phase 4 — broadcast the local cursor through Y.Awareness.
//
// One pointermove listener on the host element, throttled to ~60 ms so
// Awareness doesn't flood. Coordinates are converted via the host-
// supplied `clientToLocal` to design-space pixels so remote viewers
// can map them back to their own viewport.

import type { SyncEngine } from "@agocraft/sync";
import { useEffect, useRef } from "react";

interface UsePresenceLocalCursorOpts {
  readonly engine: SyncEngine | undefined;
  readonly hostRef: { readonly current: HTMLElement | null };
  readonly clientToLocal: (
    clientX: number,
    clientY: number,
  ) => { readonly x: number; readonly y: number };
  /** Throttle window for broadcasts. Default 60 ms ≈ 16Hz which is the
   *  cursor-update cadence most CRDT-collab tools settle on. */
  readonly throttleMs?: number;
}

export function usePresenceLocalCursor(opts: UsePresenceLocalCursorOpts): void {
  const lastSentRef = useRef(0);
  useEffect(() => {
    const engine = opts.engine;
    const host = opts.hostRef.current;
    if (engine === undefined || host === null) return;
    const throttleMs = opts.throttleMs ?? 60;

    const onMove = (e: PointerEvent): void => {
      const now = performance.now();
      if (now - lastSentRef.current < throttleMs) return;
      lastSentRef.current = now;
      const { x, y } = opts.clientToLocal(e.clientX, e.clientY);
      engine.presence.setLocal({ cursor: { x, y } });
    };
    const onLeave = (): void => {
      engine.presence.setLocal({});
    };

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      engine.presence.setLocal({});
    };
  }, [opts.engine, opts.hostRef, opts.clientToLocal, opts.throttleMs]);
}
