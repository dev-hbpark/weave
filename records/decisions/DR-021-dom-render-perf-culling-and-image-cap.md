# DR-021 — Keep DOM rendering; fix infinite-canvas perf via viewport culling + image raster cap

| Field | Value |
|---|---|
| ID | DR-021 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Status | Accepted |
| Work Item | [WI-058](../work-items/WI-058-infinite-canvas-render-performance.md) |
| Review | [RPR-001](../rendering-reviews/RPR-001-infinite-canvas-zoom-render.md) |

## Context

RPR-001 (verdict: **Needs Optimization**) traced the infinite-canvas zoom
performance problem to a scale-agnostic renderer: items render at declared
design-pixel size and zoom is delegated to one outer `transform: scale()`, so
the browser raster-scales the whole content layer (images worst) and, with zero
culling, the entire document stays live. It left one fork open that a rendering
review cannot decide: **keep the DOM surface vs. migrate to the agocraft
Canvas2D renderer.**

## Decision

**Keep DOM** (DR-012 HTML-canonical surface stays). The editor's selection
chrome, hover affordances, drill/focus stages, Lexical text editing, and a11y
all depend on the DOM tree; a Canvas2D migration would re-open DR-012 and cost
far more than the problem warrants. Improve performance *within* the existing
`transform`-based camera model:

1. **Viewport culling (primary).** A single `IntersectionObserver` (root = the
   viewport-clipping `outerRef`, one-viewport `rootMargin` buffer) toggles
   off-screen frames to `visibility: hidden`, dropping their paint + raster.
   Bounds the live painted/composited set to ~viewport regardless of document
   size — the dominant aggregate-memory fix. Implemented as a context-published
   registry with direct `style.visibility` ref-mutation (no React re-render),
   mirroring the existing `applyHitGate` / `TotalScaleContext` pattern.
2. **Image decode deferral (cheap).** `loading="lazy"` + `decoding="async"` on
   the `<img>` so off-screen / not-yet-needed images don't decode up front.
3. **Image raster cap (deferred, Phase 2).** For deep zoom-in on a single
   image, cap the backing raster to ~screen px (inverse-scale). Own spike + e2e
   because of objectFit/crop/filter interactions.

This is a **resolution of the RPR-001 fork**, not a fresh feasibility question —
no new SOTA is being pushed, so a full Technical Feasibility Review is not
required for the DOM path. (A Canvas2D migration *would* have required one.)

## Why not `content-visibility: auto`

It implies `contain: paint`, which clips a frame's intentional overflow bleed
(slide bullets / canvas shapes drawn past the frame — documented behavior in
`Stage.tsx` / `FrameContent.tsx`). `visibility` adds no containment, so bleed
survives while a frame is on-screen. Rejected for the culling mechanism.

## Consequences

- **+** Live texture/layer set bounded to viewport+buffer; pan/zoom INP and GPU
  memory improve on large documents. Additive, infinite-canvas-gated,
  null-safe in present/test paths → low regression risk.
- **−** A frame just outside the buffer that pans in fast could pop in; mitigated
  by the one-viewport `rootMargin`. Tune if observed.
- Phase 2 (single-image raster cap) remains a tracked, separate change.

## SOLID / GRASP

- **SRP / Information Expert:** culling decision (geometry vs. viewport) is owned
  by the browser's IntersectionObserver, not hand-rolled in React; FrameStage
  owns the observer lifecycle; NestedFrame owns only "register my element".
- **OCP / Rule 6:** no `kind`/`mode` branching added; culling is uniform across
  all frame kinds. Mode gate is a single source (`infiniteCanvas` → registry
  null/non-null), not inline compares.
- **Low coupling:** domain renderers reach the registry through a context in
  `document/interactions/` (no import back into `pages/FrameStage`), same as
  `TotalScaleContext`.
