# DR-059 — Text outline via a layered duplicate (thick stroked back layer)

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-029 (Phase 2 follow-up)
- **Relates:** DR-057 (`textRuns` single source of truth — `renderReadOnly` is the
  reused glyph renderer), `TextBlock.tsx` render path, `text-section.tsx` toolbar,
  weave-local `TextAttrs` extension pattern (`textOverflow` in `types.ts`)

## Context

Request: add a text outline (외곽선). The naive route — a single
`-webkit-text-stroke` on the text — draws the stroke **centered** on the glyph
outline, so half of it eats into the fill and thick outlines make letters
mushy/illegible.

Feasibility: outlining text in CSS is fully supported (Baseline) via
`-webkit-text-stroke` + `paint-order`. The question is the **technique**, not
whether it is possible.

## Decision

Render the text as **two stacked layers** (the chosen "layered duplicate"
technique), not a single stroked layer:

- **Back layer** — the SAME text/runs, filled in the outline color AND given a
  large `-webkit-text-stroke` in the same color, so each glyph becomes a solid,
  uniformly fattened blob extending `width` px beyond the original outline.
  `aria-hidden`, `pointer-events: none`, painted BEHIND.
- **Front layer** — the normal fill text, painted ON TOP. This is the real text
  (selection, links, a11y).

Because the front fill is always composited above the back, the glyph stays
crisp and the back only peeks out at the edges → a clean, even outline that the
single-layer stroke cannot achieve.

### Model — weave-local, no vendored change

```ts
// types.ts — TextAttrs intersection (same pattern as `textOverflow`)
textOutline?: {
  readonly color: string;  // hex or StyleRef token; resolved via useResolveColor
  readonly width: number;  // VISIBLE halo thickness, design-px
};
```

Survives serialization via the serializer's `onUnknown: "preserve"` default — no
`@agocraft/core` (vendored) schema change. Whole-item for v1 (per-range outline
is deferred — the Lexical editor has no native command for it).

### Render (TextBlock)

- Reuse `renderReadOnly` for BOTH layers. Add an `outline` mode to it: in outline
  mode the per-run spans emit only **glyph-shape** props (family / size / weight /
  style / letter-spacing) and DROP per-run `color` + `textDecoration`, so the back
  container's forced outline color + stroke (both inherited CSS properties) apply
  uniformly to every glyph.
- The measured element (`[data-text-content]`, watched by the auto-fit
  `ResizeObserver`) keeps holding the FRONT fill in normal flow, so the box never
  inflates by the stroke. The back is `position: absolute; inset: 0` inside that
  same box (so it shares the exact text layout via inheritance), `z-index: 0`;
  the front gets `z-index: 1`. `-webkit-text-stroke` is paint, not layout, so it
  does not change `scrollWidth/Height`.
- `WebkitTextStroke` width = `2 × outline.width` (the stroke is centered, so half
  extends outside; `2×` makes the visible halo equal `outline.width`).
  `paintOrder: "stroke"` keeps the back blob coherent.
- Only rendered when `textOutline.width > 0` **and not actively editing** —
  Lexical is a single contenteditable, so the outline shows in read-only /
  present (same policy as rich-run rendering). Non-outline text is byte-for-byte
  unchanged (the whole layer is gated behind `hasOutline`).

### Toolbar

A "외곽선" field in the existing 스타일 accordion of `text-section.tsx`: a
`ColorPicker` (outline color, stored via `pickerValueToStored` like the other
colors) + a `NumberSlider` (width, design-px) + a clear affordance. Width 0 /
unset = off. Whole-item via `updateAll`.

## Consequences

- (+) Cleaner, even outline than single-layer `-webkit-text-stroke`; the back
  layer is independently controllable (later: offset for hard shadow, blur for
  glow) without touching the front.
- (+) No vendored dependency change; reuses `renderReadOnly`; auto-fit
  measurement unaffected (front defines the box).
- (+) Backward compatible — outline path is fully gated behind `hasOutline`.
- (−) Doubles the text DOM/paint for outlined items (one extra render pass).
  Negligible at realistic text counts; outlined text is the exception, not the
  default.
- (−) The outline is not shown live **while** the Lexical editor is mounted
  (edit mode); it appears on edit-exit. Acceptable, consistent with rich-run
  rendering. A WYSIWYG-in-editor outline is deferred.
- (−) `-webkit-text-stroke` line-join is browser-fixed (round on WebKit/Blink);
  no miter control. Acceptable for v1.

## Verification

- Unit (`TextBlock.test.tsx`, client render): with `textOutline`, an
  `aria-hidden` back layer exists carrying `-webkit-text-stroke` in the outline
  color and `pointer-events:none`; the front fill text is present and above; with
  no `textOutline`, no back layer is emitted (unchanged DOM).
- Outline mode of `renderReadOnly`: a colored run does NOT leak its color onto
  the back layer (back glyphs inherit the forced outline color).
