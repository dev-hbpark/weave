# WI-239 — Presentation-view whiteboard: ephemeral ink + blank board (Phase 1, local presenter)

## Metadata

| Field | Value |
|---|---|
| ID | WI-239 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Status | **DONE — Phase 1 built + live-verified (typecheck + 11 unit + 3 e2e green). Phase 2 (multi-user) remains gated on WI-028.** |
| Type | New feature — present-mode input modality |
| Feasibility | [FR-025](../feasibility-reviews/FR-025-presentation-whiteboard.md) (FEASIBLE WITH TRADE-OFFS) |
| Decision | [DR-154](../decisions/DR-154-presentation-whiteboard-phased-ephemeral-ink.md) |
| Risk | [RISK-013](../risks/RISK-013-presentation-whiteboard.md) |
| Related | WI-028 (collaborative sync — paused; Phase 2 dependency), WI-194/DR-127 (deck policy), WI-153/WI-166 (page-bounded present) |

## Problem (requested)

Operator: "프레젠테이션뷰에 화이트보드 기능을 추가하려고해." During a presentation the
presenter wants to (a) draw freehand **over the live slide** (PowerPoint-pen
annotation) and (b) toggle a **blank board** for ad-hoc sketching. Ink is
**ephemeral** (this presentation session only — like reveal state) and ultimately
**shared in real time across viewers**.

## Current state (why this is net-new)

- Present mode (`PresentPage.tsx` + `Stage.tsx`) is **strictly read-only**: no
  `editor.exec`, document untouched, step/reveal state ephemeral React state.
- **No drawing/ink/pen capability anywhere** in weave (editor or present).
- Present mode has **no GestureRouter** — keyboard nav + click-to-advance only; it
  does not currently receive drag/pointer input.
- The right multi-user transport exists (`@agocraft/sync` Awareness, `PresenceCursors`)
  but is **`SYNC_ENABLED = false`** and unwired in present mode.

See FR-025 for the full architecture map.

## Decision (chosen by operator) — Phase split

Operator chose: **slide-annotation + blank board both**, **ephemeral** storage,
**real-time multi-user**. Because the only hard dependency (paused, cost-sensitive
WI-028 infra) sits solely on the multi-user axis, the work is split (DR-154):

- **WI-239 (this) = Phase 1 — local presenter ink + blank board.** Zero infra
  dependency, independent of `SYNC_ENABLED`. Ships standalone.
- **Phase 2 — real-time multi-user.** Separate WI, gated on the WI-028 cost
  decision; rides Phase 1's stroke stream onto the awareness channel.

## Phase 1 scope

**In scope**
- An **ephemeral ink overlay** composited above `Stage` scenes, in **design-space**
  coordinates (ink sticks to slide content through camera zoom/pan).
- **Tools:** pen, highlighter (alpha), eraser (stroke-erase), color, width, clear-all.
- **Blank board:** a toggled full-viewport ephemeral surface (own background), drawn
  on with the same tools. NOT inserted into the document step sequence.
- **Local undo/redo** over the ephemeral stroke stack (NOT document history).
- **Mode toggle** in `PresentChrome` (pen on/off); when off, present click-to-advance
  and keyboard nav behave exactly as today.
- Auto-clear-on-step option (annotations clear when advancing slide) vs persist
  across steps — default: ink is per-step, cleared on navigation (PowerPoint behavior).

**Out of scope (deferred)**
- Real-time multi-user sync → **Phase 2** (WI-028 gate).
- Any persistence to the document → excluded by the "휘발성" decision.
- Late-joiner replay, ink history artifacts.
- Shape recognition / smart-ink / laser-pointer mode (possible follow-ups).

## Engineering Plan (Phase 1)

**P1 — Ink model + tool registry** (`features/present/ink/`)
- `InkStroke` = `{ id, toolId, points: DesignPoint[], color, width, opacity, step }`,
  pure data, design-space points.
- `ink-tools.ts` — a **registry** of tool adapters (`pen`, `highlighter`, `eraser`),
  one adapter per tool behind a stable `InkTool` interface (`onDown/onMove/onUp`,
  `renderStyle`). New tool = new registered adapter. **No `switch (toolId)`** (Rule 6).

**P2 — Capture hook** (`use-ink-capture.ts`)
- One pointer handler on the ink overlay host. Active only when ink mode is on
  (single-source gate `useInkModeActive()` — not inline mode compares).
- Converts client→design coords via the existing `clientToLocal` seam (reused from
  presence cursors). Emits committed strokes through an **`onStroke` callback**
  (producer emits synchronously; the consumer chooses what to do — Phase 1 consumer
  = local store; Phase 2 adds an awareness broadcaster consumer **without touching
  capture**). This producer/consumer seam is the Phase-2 insertion point.

**P3 — Ephemeral store + render view**
- `useInkSession()` — ephemeral stroke array + undo/redo stack + clear; keyed by
  step for per-step clear. No document round-trip.
- `<InkLayer>` — presentational SVG/canvas view: renders strokes from props in
  design-space, projected by the same camera transform Stage uses. Pure render, no
  store reads (view/hook split per UI_COMPONENT_STRUCTURE).

**P4 — Blank board overlay**
- `<BlankBoardLayer>` — toggled full-viewport surface with its own background, same
  `InkLayer` underneath. Present-only state; does not enter the step sequence.

**P5 — Chrome + toggles**
- Extend `PresentChrome` with an ink toolbar (tool/color/width/clear/undo/board
  toggle), reusing design-system primitives via `design-system-triage` (ColorPicker
  already exists). Mode toggle flips `useInkModeActive()`; pointer interception is
  gated so non-ink present behavior is byte-for-byte unchanged when off.

**P6 — Self-verification (Continuous)**
- Live browser check per the self-verification loop: ink follows zoom/pan, eraser
  hits, per-step clear, blank-board toggle, and **most important — present
  click-to-advance / keyboard nav unaffected when ink mode is OFF** (no input
  regression). Memory note: present live-input has a recurring feedback-loop trap →
  live-verify, do not merge on unit tests alone.

## SOLID / GRASP pass (embedded per CLAUDE.md)

- **SRP / view-logic split:** capture (hook) · ephemeral session (hook) · render
  (pure view) · tool policy (registry) are four separate units. Litmus: `<InkLayer>`
  renders from props with no provider; `useInkCapture` tests with `renderHook`.
- **OCP / Rule 6:** tools resolve through `ink-tools` registry — one adapter per
  tool, no `switch`/`if-else` on `toolId`. Mode is a single-source `useInkModeActive()`
  hook, not inline string compares.
- **Rule 2 (consumption boundary):** this is app/runtime code (stateful present
  session), so component+hook composition is correct; no inheritance, no class
  hierarchy.
- **Open extension seam (the Phase-2 lever):** capture **emits strokes
  synchronously** through `onStroke` with an origin tag; consumers choose scheduling
  (local render now; awareness broadcast in Phase 2). Producer never knows about the
  consumer — the workspace producer/consumer principle, and exactly what keeps
  Phase 2 from reopening Phase 1.

## QA / test plan

- Unit: `ink-tools` registry shape + per-tool style; `useInkSession` undo/redo +
  per-step clear; coordinate round-trip (client→design→projected) identity.
- Component: `<InkLayer>` renders strokes from props; eraser removes intersected
  stroke.
- E2E (present): draw over slide → zoom → ink stays anchored; toggle blank board →
  draw → toggle back; **ink mode OFF → ArrowRight advances, no stroke captured**
  (regression guard). Note known baseline: present e2e under no-network sandbox has
  the vendored-engine `@fs` networkidle caveat (see page-bounded memory) — use the
  worktree-baseline recipe.

## Build result (2026-06-16)

**design-system (`@weave/design-system`):**
- `Stage.tsx` — added a domain-neutral `overlay?: ReactNode` slot rendered as the
  topmost child *inside the camera plane* (`motion.div`), so an in-plane layer shares
  the pan/zoom transform. Additive; defaults to nothing → existing callers unchanged.

**apps/web — `src/features/present/ink/` (net-new):**
- `types.ts` — `InkPoint` / `InkStrokeStyle` / `InkStroke` (ephemeral model).
- `ink-tools.ts` — tools as composed Strategy objects behind a registry (`pen`,
  `highlighter`, `eraser`); `createDrawTool` / `createEraseTool`; `inkTool(id)` /
  `INK_TOOL_ORDER` / `isDrawTool`. No `switch (toolId)`.
- `ink-session.ts` — pure store: handler-registry reducer (no `switch (action.type)`),
  per-surface strokes, bounded global undo/redo, stroke-erase hit test
  (point→segment distance, tolerance scales with width).
- `use-ink-session.ts` / `use-ink-capture.ts` / `use-ink-mode.ts` — React bindings:
  ephemeral store, pointer capture → strategy dispatch → **`onCommitStroke`/`onErase`
  emit seam** (the Phase-2 insertion point), single-source mode controller.
- `InkLayer.tsx` — coordinate-agnostic capture+SVG-render surface (`offsetX/Y` =
  surface coords; SVG `pointer-events:none`; layer inert when `enabled=false`).
- `InkToolbar.tsx` — dark-glass chrome; tool/color/width/undo/redo/clear/board.
- `PresentPage.tsx` — wired the slide overlay (design-space, in Stage plane), the
  blank-board full-viewport overlay (z-40, below chrome), and the toolbar.

**Key coordinate decision (validated live):** the slide ink layer sits **inside
Stage's camera plane** sized to the design, so `offsetX/offsetY` are design pixels and
ink tracks zoom/pan with **zero manual projection** — confirmed by the draw e2e.

**Verification:**
- Typecheck (apps/web + design-system) clean; my files lint clean (the 29 repo-wide
  biome errors are pre-existing in untouched files — `frame-sizing-refit.spec.ts`,
  `design-system/index.ts`).
- Unit: `ink-session.test.ts` (6) + `ink-tools.test.ts` (5) green; full suite **1437**.
- E2e `present-ink.spec.ts` (3) green: (1) **R3 gate** — slide layer pointer-inert
  when off, armed/`pointer-events:auto` when on, round-trip; (2) draw → exactly one
  SVG mark, undo removes it; (3) blank board toggles, slide inert while board open,
  draw marks, close re-arms slide.
- **E2e sandbox note:** the shared `prepareDesign` helper's `waitForLoadState
  ("networkidle")` never settles reliably here (documented vendored-engine @fs
  baseline). The spec uses a local `createDeckNoIdle` that gates on the
  `__weaveEditor/__weaveDoc/__weaveVm` ready handshake instead — networkidle-free.

## Remaining

- **Phase 2 (multi-user)** — separate WI. Cost/infra feasibility now reviewed in
  [FR-026](../feasibility-reviews/FR-026-presentation-whiteboard-phase2-realtime.md):
  verdict **FEASIBLE at ≈ $0 marginal cost** via a thin awareness-only WS relay on a
  free always-on host (Oracle Always-Free VM or the small-think Cloudflare-tunnel box),
  riding the Phase-1 `onCommitStroke`/`onErase` seam. **Key correction:** the long-held
  "blocked on WI-028's Upstash cost" framing is wrong — the existing HTTP-poll
  transport carries the *document*, not awareness (its `Awareness` object never goes
  over the wire), and present ink needs neither Upstash, polling, nor document sync. So
  Phase 2 needs a *new* WS transport regardless, and the real gates are **ops**
  (a stable `wss://` endpoint, not an ephemeral quick-tunnel) + **product** (a live
  session/room model, smallest as presenter-broadcast-only). No Phase-1 rework.
- Editor-added frames don't join a slide-deck's `presentationOrder` (seed-time fixed),
  so present shows one step — orthogonal deck-seeding behavior, noted while testing.
- Decommission sweep: none (net-new surface).
