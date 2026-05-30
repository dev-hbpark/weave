# Rendering Performance Review — Infinite-Canvas Zoom Render

> Filled artifact for the `rendering-performance-review` skill. Workflow step: **rendering-review**.
> Framework: OS-root `docs/04-specialized-engineering/RENDERING_PERFORMANCE_ARCHITECTURE.md` (JS → Style → Layout → Paint → Composite).
> Reflow API reference: OS-root `docs/04-specialized-engineering/WEB_API_REFLOW_WATCHLIST.md`.

## Metadata

| Field | Value |
|---|---|
| Target | Infinite-canvas zoom/pan render — `apps/web/src/pages/FrameStage.tsx` (editor) + `packages/design-system/src/components/Stage.tsx` (present) + `@agocraft/domain-media` image render |
| Owner | weave canvas / rendering |
| Reviewer agent | `rendering-performance-architecture-agent` |
| Date | 2026-05-30 |
| RPR | RPR-001 |

## Problem statement (reporter)

> 무한 캔버스에서 줌인/아웃 시 렌더러가 이미지를 줌배율만큼 거대하게 그리려 해서 성능 문제 발생. 사용자 화면은 고정 해상도이므로, 물리적 렌더는 화면 해상도에 맞춘 적정 크기로 하고 줌인/아웃은 "논리적"으로만 존재하게 만들고 싶다.

Translated intent: the renderer paints content at `design-px × zoom`, so a zoom-in inflates every layer (images worst) far past what the fixed-resolution viewport can show. The desired model: **logical zoom** (a camera) decoupled from **physical render** (always at viewport/device resolution).

## Interaction class

- [ ] Initial render (LCP / FCP)
- [x] Drag / resize — pan gesture
- [x] Animation / transition — anchored zoom, drill spring, present camera tween
- [x] Canvas / SVG / WebGL update — design-plane is an oversized DOM/CSS-transform surface
- [x] Large list / virtualized scroll — whole document is always mounted (no virtualization)

This is **not** a classic LCP problem. The governing Core Web Vital is **INP** (pan/zoom interaction responsiveness) plus a non-CWV budget: **GPU/layer texture memory and paint area**, which is where the reported failure actually lives.

## Confirmed code findings (verified file:line)

### 1. Editor — CSS `transform: scale()` on a giant whole-document container

`apps/web/src/pages/FrameStage.tsx`

- `nextPanForZoom` (L113–131): scale clamp `[0.1, 8]`, anchored-zoom math against the pan div's `transform-origin: center center`.
- Plane subtree (L2133–2165): outer pan `<div>` gets `transform: translate(${pan.tx}px, ${pan.ty}px) scale(${pan.scale})` (`transformOrigin: center center`), wrapping a `motion.div` design plane of fixed `width: ${designWidth}px × height: ${designHeight}px` (`transformOrigin: top left`) carrying its own drill-spring `scale: planeScaleMV`.
- `willChange: gestureActive ? "transform" : undefined` (L2163) — **correctly gated** (WI-037 / DR-018; `gestureActive = panDragging || recentWheel`, L2044).
- All `planeChildren` (frames/items) live **inside** this transformed plane at absolute design-pixel coords (L2166).
- Hit gate only: `HIT_THRESHOLD_PX` sets `pointerEvents = "auto"/"none"` by on-screen footprint (L436–438). It does **not** unmount, cull, or stop painting/compositing — items stay live in the DOM at every zoom.

### 2. Present — single transformed design-plane

`packages/design-system/src/components/Stage.tsx`

- Single `motion.div` (L256–282): `width/height = designSize`, `transformOrigin: "0 0"`, `x/y` translate, `scale: scaleMV`.
- `willChange: animating ? "transform" : "auto"` (L269) — **correctly gated**; dropping the hint on settle lets the browser flatten the layer and re-rasterize text crisp (comment L264–268).
- `isolation: "isolate"` (L278) — stabilizes descendant `backdrop-filter` against the camera transform (matches the workspace memory note on backdrop-filter dropping under transform).
- `baseScale = min(vp.w/design.w, vp.h/design.h)` (L148); `targetScale` clamp floor `0.0001` (L149). Scenes positioned absolutely inside.

### 3. Image render — destination rect is full design-px frame, no camera

`workspace/agocraft/packages/domain-media/src/renderable.ts`

- HTML adapter (canonical per DR-012; L148–185): wrapper `<div>` at `a.x/a.y/a.width/a.height` design px (L161–165), inner `<img>` at `width/height: 100%` + `objectFit` + `loading="lazy"` (L169–173). The `<img>`'s rasterized size is the wrapper's design size; the browser raster-scales that layer by the ancestor zoom transform.
- Canvas2D adapter (L97–128): `drawImage(img, dx, dy, dw, dh)` where `dw/dh` come from `computeFitRect(a.x, a.y, a.width, a.height, natW, natH, fit)` (L313–363) — destination rect is the **full design-pixel frame size, not viewport/zoom-adjusted**. No camera is passed into `RenderContext`.

## Root cause

Rendering is **scale-agnostic**: every item renders at its declared design-pixel size and zoom is delegated entirely to an outer CSS transform. The browser then raster-scales the whole content layer (images included) by the zoom factor.

- At high zoom a single image becomes a multi-thousand-pixel GPU texture. Past the platform `max-texture-size` (typically 4096–8192 px per axis) the compositor must tile, fall back, or thrash — memory blows up and frames drop.
- With **zero culling** (no frustum/quadtree, no virtualization), the entire document stays mounted, styled, laid out, painted, and composited at all zoom levels — even content scrolled or zoomed completely off-screen.

This is primarily a **Paint + Composite** problem (oversized layers, texture-memory pressure), compounded at the **Layout** stage by every item being permanently mounted.

## Pipeline impact

| Stage | Impact | Notes |
|---|---|---|
| JavaScript | Med | Today: cheap (transform math only). After redesign: a per-frame `worldToScreen` + cull pass over all items risks a long task — must be budgeted/yielded (see Long-task plan). |
| Style recalc | Low | Camera transform is a single property on one node; no per-item class churn today. |
| Layout / reflow | Med | All items mounted at design-px size regardless of zoom. The fixed `designWidth × designHeight` plane keeps reflow bounded today, but DOM node count is unbounded in document size and never culled. |
| Paint | **High** | Whole document painted at all times; at high zoom the painted/rasterized area per image scales with zoom². This is the reported failure. |
| Composite | **High** | Oversized image textures can exceed `max-texture-size` → tiling / fallback / GPU-memory blowup. Layer promotion is correctly gesture-gated, so layer *count* is not the issue — layer *size* is. |
| GPU / layer memory | **High** | Single zoomed image texture ≈ `(designW·zoom) × (designH·zoom) × 4 bytes`. Mid-tier device budget is exceeded well before the `scale: 8` clamp on a large image. |

## Reflow / layout-thrash risk

| File:line | Layout-trigger API | Adjacent write? | Pattern | Fix |
|---|---|---|---|---|
| `Stage.tsx` L138–143 | `ResizeObserver` → `getBoundingClientRect`-equivalent read | no | observer-based (correct) | none — observer-driven, not in a read/write loop |
| `FrameStage.tsx` L436–438 | none (reads cached `widthPx/heightPx` from props × scale) | writes `el.style.pointerEvents` via ref | per-scale-change ref mutation, not React re-render | none today; **the redesign's `worldToScreen` pass must not introduce a read-then-write layout thrash** — keep camera math pure (no `getBoundingClientRect`/`offset*`/`getComputedStyle` per item) |

No existing forced-reflow or layout-thrash site. The risk is **prospective**: the proposed per-item `worldToScreen` + cull pass must read camera state from a single source and write screen rects in a batched pass, never interleaving DOM measurement with style writes per item. See `WEB_API_REFLOW_WATCHLIST.md` for the banned-in-loop API list (`getBoundingClientRect`, `offsetTop/Width`, `getComputedStyle`, `scrollTop`).

## CSS / paint risk

- [x] Animations on `transform` / `opacity` only (composite-only) — confirmed both surfaces.
- [x] Layout properties NOT animated — confirmed; no `width/height/top/left` animation.
- [x] `will-change` applied only during animation and removed on settle — **confirmed both files** (`FrameStage.tsx` L2163 `gestureActive`; `Stage.tsx` L269 `animating`). This is already correct and must be preserved by the redesign.
- [x] `backdrop-filter` stabilized via `isolation: isolate` (`Stage.tsx` L278) — correct.
- [ ] Texture/raster bound: **MISSING** — no clamp keeps a rasterized layer within viewport × DPR. This is the core gap.
- [ ] CSS containment: not applied. `contain: layout paint` (or `content-visibility: auto`) on off-screen frame subtrees is a candidate cheap win even before the full camera redesign.

## DOM size & virtualization

- DOM node count: unbounded — grows with document item count; **never culled** at any zoom.
- Virtualization: **none**. No `react-window` / `@tanstack/virtual` / custom frustum cull.
- `content-visibility: auto` for off-screen subtrees: not applied — candidate quick mitigation.

## Proposed target architecture (under review)

Decouple **logical zoom (camera state `{tx, ty, scale}`)** from **physical render (always at viewport/device resolution)**:

1. **Per-item screen projection** — each item computes `screenRect = worldToScreen(worldRect, camera)` and renders at that screen-pixel size, clamped to `viewport × devicePixelRatio`. Logical zoom never inflates a layer past what the screen can show.
2. **Viewport culling** — skip items whose `screenRect` falls outside the viewport (frustum cull; quadtree/spatial index when item count warrants). Replaces the mount-everything model; the existing `HIT_THRESHOLD_PX` gate becomes a culling input rather than a pointer-events-only gate.
3. **Images at displayed size** — draw/decode the image at its on-screen size. The agocraft Canvas2D adapter is structurally close already: `drawImage(img, dx, dy, dw, dh)` just needs `dw/dh` fed from the screen rect instead of `computeFitRect` over the full design frame. Optional mip/thumbnail tier for zoomed-out states.
4. **Two-phase quality** — cheap transform during a continuous gesture, re-raster at device resolution on settle. **Both files already implement the will-change-drop trick** (`Stage.tsx` L269) that this phase depends on; reuse it.
5. **Single-source camera + batched projection** — camera state is the producer; the projection/cull pass is a consumer that runs on rAF, reads camera once, and writes screen rects in one batched write (no per-item DOM measurement) to avoid introducing layout thrash.

### Key fork — DOM vs Canvas (requires Feasibility Review + DR)

The weave **editor** is DOM-based (DR-012: HTML canonical visual surface). Two divergent paths:

- **Keep DOM**: implement `worldToScreen` per-item layout + culling + explicitly sized `<img>` (set `width/height` attributes to screen px, optionally `srcset`/decode hints). Lower migration cost, stays within DR-012, but the renderer must own per-item screen layout that the CSS transform currently does for free.
- **Switch the canvas surface to the agocraft Canvas2D renderer**: cleaner memory story (one canvas, draw at screen size, no per-item layers) but a higher-cost surface migration and a change to the canonical-surface decision (DR-012).

This fork is **not resolvable inside a rendering review**. It needs a **Technical Feasibility Review** (FR-NNN) and a **Decision Record** (DR-NNN) before any build. If the Canvas2D path is chosen, the agocraft Canvas2D renderer must accept a camera in `RenderContext` and draw to screen rects — an **agocraft-side change that requires a HANDOFF into `workspace/agocraft/records/decision-handoffs/`**, not a direct edit from this review.

## Core Web Vital impact

| Metric | Threshold | Current p75 | Projected after change | Source |
|---|---|---|---|---|
| **LCP** | ≤ 2.5s | n/a | n/a | not the governing metric here |
| **INP** | ≤ 200ms | unmeasured | target ≤ 200ms on mid-tier | RUM (web-vitals v4) / Lab (DevTools) |
| **CLS** | ≤ 0.1 | n/a | n/a | camera transform does not shift layout flow |
| **GPU layer memory** (non-CWV) | within mid-tier budget; no single texture > `max-texture-size` | exceeded at high zoom on large images | clamped to `viewport × DPR` | DevTools Layers panel + chrome://gpu / Memory |
| **Frame time during gesture** (non-CWV) | ≤ 16.7ms (60fps) / no dropped frames | drops at high zoom | steady on throttled mid-tier | DevTools Performance frame timing |

## Long-task plan (INP-sensitive paths)

- New risk: the `worldToScreen` + cull pass over all items on every camera change could exceed 50ms on large documents → INP regression.
- Mitigation:
  - Run the pass on `requestAnimationFrame`, coalescing multiple wheel/drag events into one projection per frame.
  - Spatial index (quadtree) so culling is `O(visible)` not `O(total)`.
  - If a single pass still exceeds budget, chunk with `scheduler.yield()` (Baseline-gated; `setTimeout(0)` fallback) and keep the last-painted frame until the next pass completes.
  - Instrument Long Animation Frames (LoAF) in RUM to catch regressions in the field.

## Platform-native alternatives considered

Cross-reference OS-root `MODERN_WEB_GUIDANCE.md`. Not directly applicable — this is a camera/render-loop problem, not a modal/popover/anchored surface. Relevant platform levers:

- `content-visibility: auto` + `contain: layout paint` on off-screen frame subtrees — cheap interim mitigation before the full redesign.
- `ImageBitmap` / `createImageBitmap` with `resizeWidth/resizeHeight` to decode images at displayed size (Canvas path).
- Before authoring any custom build/tiling pipeline, check GoogleChromeLabs repos first (`squoosh` for image resizing tiers). Do not re-author a thumbnail pipeline if `squoosh`-class tooling fits.

## Measurement plan

**Required before build (baseline) and after (verification):**

- **Lab — DevTools Performance**: record a pinch/wheel zoom-in to `scale: 8` over a frame containing a large image. Report main-thread time, paint count, paint area, dropped frames, and the longest task on the interaction path.
- **Lab — DevTools Layers panel**: inspect layer count and per-layer memory at `scale: 1`, `4`, `8`. Confirm no single image layer exceeds `max-texture-size`; record GPU memory via chrome://gpu and the Memory panel.
- **Throttled mid-tier device profile** (REQUIRED for this high-risk change): CPU 4× throttle + Slow 4G. Reproduce the zoom on the throttled profile; capture frame timing and INP.
- **Field — web-vitals v4**: stream INP to analytics, segmented by device class. Wire LoAF for long-task attribution on the pan/zoom path.
- **Regression alerts**: p75 INP per editor route; GPU-memory budget alert; a synthetic zoom trace in CI on the largest fixture document.

## Decision

- [ ] **Pass**
- [ ] **Pass with Conditions**
- [x] **Needs Optimization** — rework before merge.
- [ ] **Block**

**Verdict: Needs Optimization.** The reported behavior is real and stems from a scale-agnostic render model plus zero culling — a Paint + Composite (texture-memory) problem compounded by an always-live DOM. The `will-change` lifecycle, composite-only transform/opacity usage, and `backdrop-filter` isolation are already correct and must be preserved. The fix is the camera/culling redesign (logical zoom decoupled from physical render at viewport × DPR).

## Conditions before build (each → a Work Item)

1. **Open a Work Item** for "infinite-canvas camera-decoupled render + viewport culling" (no open WI covers canvas render perf today; closest prior art is WI-037 / DR-018, which only gated will-change).
2. **Resolve the DOM-vs-Canvas fork via Technical Feasibility Review (FR-NNN) + Decision Record (DR-NNN)** before any build. This is mandatory per the workflow (Feasibility sits between Discovery and Plan) for a platform-pushing render change.
3. **Baseline measurement first** — capture the lab + throttled-device + Layers-panel baseline above before writing code, so the after-numbers are comparable.
4. **If the Canvas2D path is selected**, raise a **HANDOFF into `workspace/agocraft/records/decision-handoffs/`** for the agocraft Canvas2D renderer to accept a camera in `RenderContext` and draw to screen rects. Do not edit agocraft from this review.
5. **Preserve the correct invariants**: gesture-gated `will-change` (FrameStage L2163 / Stage L269), composite-only animation, `isolation: isolate` for backdrop-filter.
6. **Interim cheap win (optional, separate small WI)**: apply `content-visibility: auto` + `contain: layout paint` to off-screen frame subtrees to reduce paint area before the full redesign lands.

## Links

- Editor surface: `apps/web/src/pages/FrameStage.tsx` (L113–131, L2133–2165, L436–438)
- Present surface: `packages/design-system/src/components/Stage.tsx` (L148–149, L256–282)
- Image render: `workspace/agocraft/packages/domain-media/src/renderable.ts` (L97–128, L148–185, L313–363)
- Related: WI-037 (design-plane tile-drop fix), DR-018 (gesture-gated will-change), DR-012 (HTML canonical visual surface)
- Related Work Items: **to be opened** (camera-decoupled render + culling)
- Related Decision Records: **to be created** (DOM-vs-Canvas fork)
