# DR-145 — Matte belongs on the un-scaled container; the page-bounds gate is rubber-band-only

## Metadata

| Field | Value |
|---|---|
| ID | DR-145 |
| Date | 2026-06-15 |
| Status | ACCEPTED |
| Work item | [WI-230](../work-items/WI-230-presentation-matte-and-marquee-from-matte.md) |
| Related | WI-153 P4 (page matte + soft clamp), WI-163 (page = artboard), WI-166/DR-114 (EditorModeContext) |

## Context

Page-bounded (slide-deck) flavors render one page with a gray **matte** outside it and
constrain editing to the page. Two coupling decisions from WI-153 P4 proved wrong:

- The marquee and rubber-band shared one `acceptTarget` gate, so the page-bounds
  restriction (meant to stop accidental off-page placement) also blocked off-page
  multi-select.
- The matte rode on the camera-scaled design plane as a fixed-spread `box-shadow`, so
  it shrank with zoom-out.

## Decision

### 1. The page-bounds gate is a property of PLACEMENT, not of SELECTION.

Split the shared predicate. `acceptWithinPage` gates only the rubber-band (drag-to-add):
placing an item requires an in-page start because the commit adapter resolves the
container from the drag rect, and a matte start would fabricate a stray ROOT frame. The
marquee is selection-only — it reads the active page's child geometry and selects; a
matte start is the expected Figma/Canva gesture and is allowed. Both keep the shared
`emptyRegionBase` (idle gate + "not on a frame child / handle / contenteditable").

### 2. The matte is owned by the un-scaled outer container, not the scaled plane.

The matte must cover the viewport at any zoom. Anything on the camera-scaled design
plane is multiplied by `totalScale`, and `clampPan` is `freePan` (unbounded zoom-out),
so no fixed value survives. Move the gray to the OUTER `frame-stage` container (never
scaled). Because the design plane is transparent and a fill-less page paints
`transparent`, the page interior previously relied on the outer container's
`background`; so recoloring the container to gray requires a paint-only `background`
backstop rect inside the design plane to restore `design.background` over the page box.
A page's own `decoration.fill` paints on top of that rect, unchanged. The plane keeps
`overflow: clip` for the WYSIWYG page edge.

## Options considered (matte)

1. **Counter-scale the box-shadow spread (`spread = K / totalScale`) via a MotionValue
   subscription.** Rejected — produces multi-million-px shadow values at extreme zoom
   (rendering-limit risk), and fights React re-renders that reset the static style.
2. **A viewport-fixed matte overlay with a punched hole tracking the page rect.**
   Rejected — needs the page's live on-screen rect (per-frame subscription) for a
   purely cosmetic region; more moving parts than the container-background approach.
3. **Chosen: matte = outer container background + in-plane `background` backstop rect.**
   Fully declarative, re-render-safe, no magic numbers, behavior-identical to today at
   normal zoom and robust at any zoom.

## Consequences

- Multi-select can begin on the matte and sweep onto the page; placement still cannot
  start off-page. The two gestures now diverge exactly where they should.
- The matte covers the viewport regardless of zoom; the page edge stays crisp (clip +
  backstop rect).
- Mixed / canvas-board (infinite) flavors are untouched: `view.pageChrome` is false, so
  the outer container keeps `design.background` and no backstop rect is rendered.
- One extra paint-only div in the page-bounded plane (negligible); the redundant
  box-shadow is removed (one fewer large composited paint).
- No agocraft change — the matte, marquee, and rubber-band wiring all live in weave
  `apps/web`; no re-vendor.
