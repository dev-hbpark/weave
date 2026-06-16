// WI-240 Phase 2 — presenter publishing seam, as a Decorator over InkSession.
//
// Wraps the Phase-1 session: every mutation writes through to the local session
// AND publishes a SessionMessage. The hot path (addStroke) publishes an
// incremental `stroke`; erase/clear/undo/redo publish a full-surface `sync` for
// convergence. Phase-1 `InkLayer`/capture are UNTOUCHED — they just receive a
// different `InkSession` (the Phase-1 producer/consumer seam paying off, DR-155).

import type { InkPoint, InkStroke, InkSurfaceKey } from "../types.js";
import type { InkSession } from "../use-ink-session.js";
import type { SessionMessage } from "./session-message.js";

export function createPublishingSession(
  base: InkSession,
  publish: (m: SessionMessage) => void,
): InkSession {
  // Surfaces this presenter has mutated — used to re-sync them after a global
  // undo/redo (which can affect any of them).
  const touched = new Set<InkSurfaceKey>();
  const syncSurface = (surface: InkSurfaceKey): void => {
    publish({ t: "sync", surface, strokes: base.strokes(surface) });
  };

  return {
    strokes: (surface) => base.strokes(surface),
    addStroke(surface: InkSurfaceKey, stroke: InkStroke) {
      base.addStroke(surface, stroke);
      touched.add(surface);
      publish({ t: "stroke", surface, stroke });
    },
    eraseAt(surface: InkSurfaceKey, at: InkPoint) {
      base.eraseAt(surface, at);
      touched.add(surface);
      syncSurface(surface);
    },
    clear(surface: InkSurfaceKey) {
      base.clear(surface);
      touched.add(surface);
      syncSurface(surface);
    },
    undo() {
      base.undo();
      for (const s of touched) syncSurface(s);
    },
    redo() {
      base.redo();
      for (const s of touched) syncSurface(s);
    },
    get canUndo() {
      return base.canUndo;
    },
    get canRedo() {
      return base.canRedo;
    },
  };
}
