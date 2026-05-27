// Multi-selection alignment + distribution — pure functions.
//
// Eight operations, one Map registry. The shape that drives this file
// follows OS-root CODE_STRUCTURE_DESIGN_RULES Rule 6 (declarative
// branching): callers declare an `AlignOp` string, the registry resolves
// the matching handler, and each handler is its own per-op function in
// this file. No `switch` on the op inside business logic; the registry
// IS the dispatch.
//
// Coordinate space — every handler operates on `ItemFrame`-shaped values
// (x, y, width, height) in the *parent's* 0..1 ratio space. The caller
// (DesignPage's multi-align dispatcher) is responsible for the same-
// parent invariant: this helper does NOT translate across parents,
// because composing different parent frames into a shared coordinate
// system requires absolute design pixels and a per-item back-conversion
// that the host owns. Same-parent only is the v1 contract; cross-parent
// align is a follow-up that would layer on top of this module without
// changing its surface.

export type AlignOp =
  | "align-left"
  | "align-horizontal-center"
  | "align-right"
  | "align-top"
  | "align-vertical-center"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

export interface AlignFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AlignInput {
  readonly id: string;
  readonly frame: AlignFrame;
}

export interface AlignOutput {
  readonly id: string;
  readonly frame: AlignFrame;
}

// ── per-op handlers ─────────────────────────────────────────────────
// Each handler is its own pure function. The return list preserves the
// caller's input order so the host can match by index when it doesn't
// want to round-trip through ids.

function alignLeft(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length === 0) return [];
  const target = items.reduce((m, it) => Math.min(m, it.frame.x), Number.POSITIVE_INFINITY);
  return items.map((it) => ({ id: it.id, frame: { ...it.frame, x: target } }));
}

function alignRight(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length === 0) return [];
  const target = items.reduce(
    (m, it) => Math.max(m, it.frame.x + it.frame.width),
    Number.NEGATIVE_INFINITY,
  );
  return items.map((it) => ({
    id: it.id,
    frame: { ...it.frame, x: target - it.frame.width },
  }));
}

function alignHorizontalCenter(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length === 0) return [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    if (it.frame.x < minX) minX = it.frame.x;
    const right = it.frame.x + it.frame.width;
    if (right > maxX) maxX = right;
  }
  const center = (minX + maxX) / 2;
  return items.map((it) => ({
    id: it.id,
    frame: { ...it.frame, x: center - it.frame.width / 2 },
  }));
}

function alignTop(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length === 0) return [];
  const target = items.reduce((m, it) => Math.min(m, it.frame.y), Number.POSITIVE_INFINITY);
  return items.map((it) => ({ id: it.id, frame: { ...it.frame, y: target } }));
}

function alignBottom(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length === 0) return [];
  const target = items.reduce(
    (m, it) => Math.max(m, it.frame.y + it.frame.height),
    Number.NEGATIVE_INFINITY,
  );
  return items.map((it) => ({
    id: it.id,
    frame: { ...it.frame, y: target - it.frame.height },
  }));
}

function alignVerticalCenter(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length === 0) return [];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    if (it.frame.y < minY) minY = it.frame.y;
    const bottom = it.frame.y + it.frame.height;
    if (bottom > maxY) maxY = bottom;
  }
  const center = (minY + maxY) / 2;
  return items.map((it) => ({
    id: it.id,
    frame: { ...it.frame, y: center - it.frame.height / 2 },
  }));
}

// Distribute — equalize the gap between adjacent items along the axis.
//
// Outermost items stay in place; the inner items shift so every pair of
// adjacent neighbours has the same gap. Matches Figma's "Distribute
// horizontal/vertical spacing".
//
// Edge cases:
//   • n < 3 — nothing to distribute (the outermost two are already in
//     place, no inner items to move) → return input unchanged.
//   • All items overlap (zero span) — gap collapses to 0; identical
//     items get the same position. Acceptable; this is a degenerate
//     input the user controls.
//   • Items overlap pairwise (gap math goes negative) — we still
//     respect the math; the user gets visibly stacked items as
//     feedback that distribution is impossible at the requested span.

function distributeHorizontal(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length < 3) return items.map((it) => ({ id: it.id, frame: it.frame }));
  const sorted = items.slice().sort((a, b) => a.frame.x - b.frame.x);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const leftEdge = first.frame.x;
  const rightEdge = last.frame.x + last.frame.width;
  const span = rightEdge - leftEdge;
  const totalWidth = sorted.reduce((sum, it) => sum + it.frame.width, 0);
  const gap = (span - totalWidth) / (sorted.length - 1);
  const placed = new Map<string, AlignOutput>();
  placed.set(first.id, { id: first.id, frame: first.frame });
  let cursor = first.frame.x + first.frame.width + gap;
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const it = sorted[i]!;
    placed.set(it.id, { id: it.id, frame: { ...it.frame, x: cursor } });
    cursor += it.frame.width + gap;
  }
  placed.set(last.id, { id: last.id, frame: last.frame });
  // Preserve caller's input order so the host can splice updates back
  // into its own selection iteration without re-sorting.
  return items.map((it) => placed.get(it.id) ?? { id: it.id, frame: it.frame });
}

function distributeVertical(items: ReadonlyArray<AlignInput>): ReadonlyArray<AlignOutput> {
  if (items.length < 3) return items.map((it) => ({ id: it.id, frame: it.frame }));
  const sorted = items.slice().sort((a, b) => a.frame.y - b.frame.y);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const topEdge = first.frame.y;
  const bottomEdge = last.frame.y + last.frame.height;
  const span = bottomEdge - topEdge;
  const totalHeight = sorted.reduce((sum, it) => sum + it.frame.height, 0);
  const gap = (span - totalHeight) / (sorted.length - 1);
  const placed = new Map<string, AlignOutput>();
  placed.set(first.id, { id: first.id, frame: first.frame });
  let cursor = first.frame.y + first.frame.height + gap;
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const it = sorted[i]!;
    placed.set(it.id, { id: it.id, frame: { ...it.frame, y: cursor } });
    cursor += it.frame.height + gap;
  }
  placed.set(last.id, { id: last.id, frame: last.frame });
  return items.map((it) => placed.get(it.id) ?? { id: it.id, frame: it.frame });
}

// ── registry ────────────────────────────────────────────────────────
// Rule 6: the only place this file references the op name as a value
// (instead of as a function). Adding a 9th op = add the handler + one
// Map entry; no other line in the codebase changes.

const HANDLERS: ReadonlyMap<
  AlignOp,
  (items: ReadonlyArray<AlignInput>) => ReadonlyArray<AlignOutput>
> = new Map([
  ["align-left", alignLeft],
  ["align-horizontal-center", alignHorizontalCenter],
  ["align-right", alignRight],
  ["align-top", alignTop],
  ["align-vertical-center", alignVerticalCenter],
  ["align-bottom", alignBottom],
  ["distribute-horizontal", distributeHorizontal],
  ["distribute-vertical", distributeVertical],
]);

/** Apply `op` to `items` and return the new frames in the same order.
 *  Pure — no doc lookup, no patches; the caller wires the result into
 *  the host (typically `editor.exec("weave.items.resizeMulti", ...)`).
 *  Same-parent-only is the caller's invariant; this helper assumes
 *  every input frame is in the same coordinate space. */
export function computeAlignedFrames(
  items: ReadonlyArray<AlignInput>,
  op: AlignOp,
): ReadonlyArray<AlignOutput> {
  const handler = HANDLERS.get(op);
  if (handler === undefined) {
    // Defensive: an unknown op (shouldn't happen — AlignOp is a closed
    // union) returns the input untouched so the host's resizeMulti
    // sees a no-op batch instead of mangled data.
    return items.map((it) => ({ id: it.id, frame: it.frame }));
  }
  return handler(items);
}

/** The full list of ops, ordered for menus / toolbars. Exported so the
 *  host UI (QuickActionBar renderItem, ContextMenu, etc.) doesn't have
 *  to hardcode the order in two places. */
export const ALIGN_OPS_ORDER: ReadonlyArray<AlignOp> = [
  "align-left",
  "align-horizontal-center",
  "align-right",
  "align-top",
  "align-vertical-center",
  "align-bottom",
  "distribute-horizontal",
  "distribute-vertical",
];
