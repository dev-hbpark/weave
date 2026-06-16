// WI-239 Phase 1 — ink tools as composed Strategy objects behind a registry.
//
// Each tool is a pointer-behavior strategy (`onDown/onMove/onUp`) operating
// on an `InkToolContext` the capture hook supplies. Adding a tool (line,
// shape, laser) is a new registered entry — NOT a `switch (toolId)` in the
// capture hook (Rule 6 / Open-Closed). The capture hook never branches on
// tool identity; it just calls the resolved strategy.

import type { InkPoint, InkStrokeStyle } from "./types.js";

/** Everything a tool strategy can do to the live capture session. The
 *  capture hook owns the draft buffer + the producer/consumer emit seam and
 *  exposes them here so tools stay free of React state. */
export interface InkToolContext {
  readonly point: InkPoint;
  /** Effective style for THIS stroke (tool defaults merged with the user's
   *  current color/width from the toolbar). */
  readonly style: InkStrokeStyle;
  /** Whether a pointer button is currently held (drag in progress). */
  readonly pressed: boolean;
  beginDraft(): void;
  extendDraft(): void;
  commitDraft(): void;
  eraseAt(): void;
}

export interface InkTool {
  readonly id: string;
  readonly label: string;
  /** Default style contribution. The toolbar owns `color` + `width`; the
   *  tool owns `opacity` + `blend` (what makes a highlighter a highlighter).
   *  `width` here is the tool's default thickness used when the user hasn't
   *  overridden it. */
  readonly defaultStyle: InkStrokeStyle;
  onDown(ctx: InkToolContext): void;
  onMove(ctx: InkToolContext): void;
  onUp(ctx: InkToolContext): void;
}

/** Draw tools (pen, highlighter) share one strategy: start a draft on down,
 *  extend while dragging, commit on up. They differ ONLY in default style. */
function createDrawTool(spec: {
  id: string;
  label: string;
  defaultStyle: InkStrokeStyle;
}): InkTool {
  return {
    id: spec.id,
    label: spec.label,
    defaultStyle: spec.defaultStyle,
    onDown: (ctx) => ctx.beginDraft(),
    onMove: (ctx) => {
      if (ctx.pressed) ctx.extendDraft();
    },
    onUp: (ctx) => ctx.commitDraft(),
  };
}

/** Eraser: stroke-granularity removal at the pointer, both on down and while
 *  dragging. No draft. */
function createEraseTool(): InkTool {
  return {
    id: "eraser",
    label: "Eraser",
    defaultStyle: { color: "#000000", width: 24, opacity: 1, blend: "normal" },
    onDown: (ctx) => ctx.eraseAt(),
    onMove: (ctx) => {
      if (ctx.pressed) ctx.eraseAt();
    },
    onUp: () => {},
  };
}

const PEN = createDrawTool({
  id: "pen",
  label: "Pen",
  defaultStyle: { color: "#ef4444", width: 4, opacity: 1, blend: "normal" },
});

const HIGHLIGHTER = createDrawTool({
  id: "highlighter",
  label: "Highlighter",
  defaultStyle: { color: "#fde047", width: 22, opacity: 0.4, blend: "multiply" },
});

const ERASER = createEraseTool();

/** Registry — one entry per tool. Consumers resolve via `inkTool(id)`; the
 *  toolbar iterates `INK_TOOL_ORDER`. */
const INK_TOOLS: Readonly<Record<string, InkTool>> = {
  [PEN.id]: PEN,
  [HIGHLIGHTER.id]: HIGHLIGHTER,
  [ERASER.id]: ERASER,
};

export const INK_TOOL_ORDER: readonly string[] = [PEN.id, HIGHLIGHTER.id, ERASER.id];

export const DEFAULT_INK_TOOL_ID = PEN.id;

export function inkTool(id: string): InkTool {
  return INK_TOOLS[id] ?? PEN;
}

/** True for tools that lay down ink (vs. the eraser). The toolbar uses this
 *  to decide whether color/width controls apply — resolved from the tool's
 *  own behavior, not a hard-coded id check at the call site. */
export function isDrawTool(id: string): boolean {
  return id !== ERASER.id;
}
