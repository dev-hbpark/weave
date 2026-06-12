// WI-198 — latest-document ref context for the frame tree's EVENT-TIME doc
// reads.
//
// `React.memo(NestedFrame)` is what bounds the per-drag-tick reconciliation
// cost to the dragged item's ancestor path (Phase 5 of
// features/canvas-render-perf/ENGINEERING_PLAN.md). That memo only holds if
// every prop is identity-stable across document ticks — and the document
// itself is the one value that, by design, changes identity on every tick.
//
// NestedFrame consumes the document exclusively at EVENT/rAF TIME (hit
// resolution in onClick, RolePolicy capability checks, SelectionLayer's
// resolveHandles) — never in its render output. So instead of a `doc` prop
// (which would defeat the memo AND hand the handlers a render-time snapshot
// that can be stale within a gesture), FrameStage publishes one stable ref
// object here and mutates `.current` each render. Handlers read
// `docRef.current` and always see the latest committed document.
//
// RULE: do NOT read this ref during render to derive render output — a
// memo-bailed frame would keep stale output. Render-affecting document data
// must arrive through the `item` prop (structurally shared) or real props.
//
// Lives beside `total-scale-context.ts` / `viewport-cull-context.ts` so
// frame-tree modules import it without a cycle into `pages/`.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { createContext } from "react";

/** Stable ref object carrying the latest committed document. Provider lives
 *  in FrameStage (identity never changes — only `.current` is mutated).
 *  Null when no FrameStage owns the tree (read-only present path, tests);
 *  `current` is undefined while the host has no document yet. */
export const DocRefContext = createContext<{
  readonly current: AgocraftDocument | undefined;
} | null>(null);
