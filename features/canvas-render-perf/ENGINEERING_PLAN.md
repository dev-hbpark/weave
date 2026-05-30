# Engineering Plan — Canvas Render Performance

WI: [WI-058](../../records/work-items/WI-058-infinite-canvas-render-performance.md) ·
DR: [DR-021](../../records/decisions/DR-021-dom-render-perf-culling-and-image-cap.md) ·
Review: [RPR-001](../../records/rendering-reviews/RPR-001-infinite-canvas-zoom-render.md)

## Goal

Bound the painted / composited / GPU-texture working set of the infinite canvas
to ~viewport size, independent of document size and zoom — while keeping the DOM
surface and the existing `transform`-based camera model unchanged.

## Pipeline target (RPR-001)

- **Paint + Composite** (primary): stop painting & rasterizing off-screen frames.
- **Layout** (secondary): culled frames keep their layout box (`visibility:hidden`)
  — no reflow, no tree restructure.
- **Core Web Vital:** INP for pan/zoom + a non-CWV GPU/layer-memory budget.

## Phase 1 — viewport culling + image decode deferral  *(this change)*

**1a. `ViewportCullContext`** (`apps/web/src/document/interactions/viewport-cull-context.ts`)
- `register(el, onChange) => unregister`. Lives beside `total-scale-context.ts`
  so domain renderers import it without a cycle into `pages/`.

**1b. FrameStage owns one `IntersectionObserver`**
- root = `outerRef` (the `overflow-hidden` viewport clipper), `rootMargin: "100%"`
  (one-viewport pre-render buffer), `threshold: 0`.
- Callback map keyed by element; fires `onChange(isIntersecting)`.
- Armed only when `infiniteCanvas` — otherwise the registry is `null`.
- Picks up frames that registered before the effect ran (child effects precede
  parent effects on a commit).

**1c. NestedFrame registers its wrapper**
- `cull.observe(selfRef.current, visible => el.style.visibility = visible ? "" : "hidden")`.
- Hook placed before the `frame === undefined` early return to keep hook order
  stable; no-ops when context is null or the element is absent.
- Direct ref-mutation → zero React re-render on the hot path (same philosophy as
  `applyHitGate`).

**1d. ImageBlock**
- `loading="lazy"` + `decoding="async"` on both `<img>` branches (crop + plain).

### Self-verification (SVL gate)

- `pnpm typecheck`, `pnpm lint` (biome), `declarativecheck` + `puritycheck`,
  `pnpm test`, `pnpm build`.
- New e2e `apps/web/e2e/canvas-cull.spec.ts`:
  1. Build a doc with frames spread far apart on the infinite canvas.
  2. A frame outside the viewport+buffer reports `visibility: hidden`.
  3. After panning it into view, it reports visible (`visibility !== hidden`).
  4. A visible frame's overflow bleed still paints (no containment regression).

## Phase 2 — image backing-raster cap  *(deferred, separate WI increment)*

Deep zoom-in on one image still rasters at `designPx × totalScale`. Cap by sizing
the `<img>` in screen px + inverse `scale(1/totalScale)` (transform-origin top-left)
so the browser rasters at ~screen resolution. Needs its own spike: objectFit,
crop wrapper, and CSS `filter` all interact with the counter-scale. Drive the
scale via the `TotalScaleContext` hot path (ref-mutation), not React state.

## Phase 3 — defensive  *(deferred)*

`will-change` lifecycle re-audit (already correctly gesture-gated per DR-018);
`content-visibility` only on subtrees proven bleed-safe.

## Out of scope / handoff

- Canvas2D migration — rejected (DR-021). If ever revisited, needs FR + DR.
- A thumbnail/mip tier for images lives in the agocraft media domain → HANDOFF
  into `workspace/agocraft/records/decision-handoffs/`, not a direct edit.
