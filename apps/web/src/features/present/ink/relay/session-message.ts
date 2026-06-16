// WI-240 Phase 2 — the live-session wire protocol (presenter → viewers).
//
// Deliberately tiny. The HOT path (a committed stroke) is an incremental
// `stroke` append for live feel; the rare/correctness paths (erase, clear,
// undo, redo) broadcast a full-surface `sync` so a viewer's surface always
// converges regardless of dropped messages. `step` follows the presenter.
//
// The relay (small-think) never inspects these — it moves opaque text.

import type { InkStroke, InkSurfaceKey } from "../types.js";

export type SessionMessage =
  | { readonly t: "stroke"; readonly surface: InkSurfaceKey; readonly stroke: InkStroke }
  | { readonly t: "sync"; readonly surface: InkSurfaceKey; readonly strokes: readonly InkStroke[] }
  | { readonly t: "step"; readonly step: number };

export function encodeSessionMessage(m: SessionMessage): string {
  return JSON.stringify(m);
}

const KNOWN_TAGS: ReadonlySet<string> = new Set(["stroke", "sync", "step"]);

/** Parse + shallow-validate an inbound frame. Returns null for anything
 *  malformed or of an unknown tag (forward-compatible — a future tag is
 *  ignored, not a crash). */
export function decodeSessionMessage(text: string): SessionMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const tag = (v as { t?: unknown }).t;
  if (typeof tag !== "string" || !KNOWN_TAGS.has(tag)) return null;
  return v as SessionMessage;
}

/** Inbound handlers a viewer supplies. */
export interface SessionMessageHandlers {
  onStroke(surface: InkSurfaceKey, stroke: InkStroke): void;
  onSync(surface: InkSurfaceKey, strokes: readonly InkStroke[]): void;
  onStep(step: number): void;
}

// Dispatch table keyed by tag — one entry per message kind, not a
// `switch (m.t)` (Rule 6). Adding a message kind = adding an entry.
type MsgFor<T extends SessionMessage["t"]> = Extract<SessionMessage, { t: T }>;
type MsgApply<T extends SessionMessage["t"]> = (m: MsgFor<T>, h: SessionMessageHandlers) => void;

const DISPATCH: { readonly [T in SessionMessage["t"]]: MsgApply<T> } = {
  stroke: (m, h) => h.onStroke(m.surface, m.stroke),
  sync: (m, h) => h.onSync(m.surface, m.strokes),
  step: (m, h) => h.onStep(m.step),
};

export function dispatchSessionMessage(m: SessionMessage, h: SessionMessageHandlers): void {
  (DISPATCH[m.t] as MsgApply<SessionMessage["t"]>)(m, h);
}
