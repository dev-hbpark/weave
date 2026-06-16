// WI-240 Phase 2 — presenter publishing seam, as a Decorator over InkSession.
//
// Wraps the Phase-1 session: each mutation writes through to the local session
// AND publishes a SessionMessage **derived from the mutation's own arguments** —
// never from a read-back of `base.strokes()`, which is stale immediately after a
// useReducer dispatch (that stale read silently dropped clear/erase to viewers).
// add→stroke, erase→erase point, clear→clear. undo/redo stay presenter-local in
// v1 (not broadcast; clear is the shared reset). Phase-1 `InkLayer`/capture are
// UNTOUCHED — they just receive a different `InkSession` (DR-155 seam).

import type { InkPoint, InkStroke, InkSurfaceKey } from "../types.js";
import type { InkSession } from "../use-ink-session.js";
import type { SessionMessage } from "./session-message.js";

export function createPublishingSession(
  base: InkSession,
  publish: (m: SessionMessage) => void,
): InkSession {
  return {
    strokes: (surface) => base.strokes(surface),
    addStroke(surface: InkSurfaceKey, stroke: InkStroke) {
      base.addStroke(surface, stroke);
      publish({ t: "stroke", surface, stroke });
    },
    eraseAt(surface: InkSurfaceKey, at: InkPoint) {
      base.eraseAt(surface, at);
      publish({ t: "erase", surface, at });
    },
    clear(surface: InkSurfaceKey) {
      base.clear(surface);
      publish({ t: "clear", surface });
    },
    // v1: undo/redo affect only the presenter's local view (not broadcast).
    undo() {
      base.undo();
    },
    redo() {
      base.redo();
    },
    get canUndo() {
      return base.canUndo;
    },
    get canRedo() {
      return base.canRedo;
    },
  };
}
