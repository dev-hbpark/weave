// WI-240 Phase 2 — the live-session wire protocol (presenter → viewers).
//
// Deliberately tiny, and every message is derivable from the mutation ITSELF
// (no read-back of session state — that read is stale right after a useReducer
// dispatch, which silently broke clear/erase propagation). The viewer applies
// each deterministically against its own copy:
//   • stroke — append the given stroke
//   • erase  — re-run the SAME hit test at the given point
//   • clear  — empty the surface
//   • step   — follow the presenter's slide
// (undo/redo are presenter-local in v1 — not broadcast; clear is the shared
// reset. See WI-240 / DR-155.)
//
// The relay (small-think) never inspects these — it moves opaque text.

import type { InkPoint, InkStroke, InkSurfaceKey } from "../types.js";

export type SessionMessage =
  | { readonly t: "stroke"; readonly surface: InkSurfaceKey; readonly stroke: InkStroke }
  | { readonly t: "erase"; readonly surface: InkSurfaceKey; readonly at: InkPoint }
  | { readonly t: "clear"; readonly surface: InkSurfaceKey }
  | { readonly t: "step"; readonly step: number };

export function encodeSessionMessage(m: SessionMessage): string {
  return JSON.stringify(m);
}

const KNOWN_TAGS: ReadonlySet<string> = new Set(["stroke", "erase", "clear", "step"]);

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
  onErase(surface: InkSurfaceKey, at: InkPoint): void;
  onClear(surface: InkSurfaceKey): void;
  onStep(step: number): void;
}

// Dispatch table keyed by tag — one entry per message kind, not a
// `switch (m.t)` (Rule 6). Adding a message kind = adding an entry.
type MsgFor<T extends SessionMessage["t"]> = Extract<SessionMessage, { t: T }>;
type MsgApply<T extends SessionMessage["t"]> = (m: MsgFor<T>, h: SessionMessageHandlers) => void;

const DISPATCH: { readonly [T in SessionMessage["t"]]: MsgApply<T> } = {
  stroke: (m, h) => h.onStroke(m.surface, m.stroke),
  erase: (m, h) => h.onErase(m.surface, m.at),
  clear: (m, h) => h.onClear(m.surface),
  step: (m, h) => h.onStep(m.step),
};

export function dispatchSessionMessage(m: SessionMessage, h: SessionMessageHandlers): void {
  (DISPATCH[m.t] as MsgApply<SessionMessage["t"]>)(m, h);
}
