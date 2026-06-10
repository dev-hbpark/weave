// WI-166 / DR-114 — EditorModeContext: per-flavor editor policy composition.
//
// THE ONLY FILE CONSUMERS MAY IMPORT from `editor-mode/` (DR-114 §2b).
// Consumers (FrameStage, NestedFrame, selection-context, FSM gates, the rail
// host, use-item-add, agent-page-target, PresentPage …) depend on the policy
// INTERFACES here and receive implementations by manual injection — React
// props / Provider, or plain function arguments for non-React consumers.
// Importing `pieces/`, `modes/` or `registry.ts` from a consumer is a layer
// violation, enforced by `tools/check_editor_mode_boundary.sh` (CI gate).
// Only the composition root (EditorModeProvider / `editorModeFor` call sites)
// may resolve a flavor to its composed context.
//
// Policies are PURE data + functions: no React, no refs. Mutable state the
// policies need (doc, activePageId …) arrives as explicit arguments — the
// React layer owns liveness (DR-114 v2 change ③).
//
// Growth contract (DR-114 §6): the context grows one policy interface per
// concern, added as a REQUIRED key in the SAME change that migrates its
// consumers (G1/G2). P1 shipped `mode` + `roles`; P2 added view / camera /
// insertion / rail (dissolving FORMAT_EDITOR_CONFIG); P3 added hit
// (one-gesture select+move on page-bounded flavors); P4 adds input.
// A policy stub without consumers would be a second truth source next to the
// live branch it is meant to absorb — exactly the dead-config drift §6-G5
// forbids, so keys land with their consumers, never ahead of them.

import type { Document as AgocraftDocument } from "@agocraft/core";

/** Declarative metadata for debug / telemetry / present surfaces — never a
 *  consumer branching key (DR-114 §6-G4: `ctx.mode ===` comparisons in a
 *  consumer mean the branch should be promoted to a policy field). */
export type CanvasMode = "infinite" | "page-bounded";

/** WI-163 — an item's role in the editing surface. `element` = an ordinary
 *  manipulable object. `stage` = a fixed editing CONTEXT (a page / artboard
 *  on page-bounded flavors): the Canva model — you edit ON it, you do not
 *  edit IT via canvas gestures. Mode-derived, never a persisted attr.
 *  Open union by design — e.g. a productized doc-page is expected to add a
 *  "flow-block" role as a new capabilities row (DR-114 §7). */
export type ItemRole = "element" | "stage";

/** What a role is allowed to do. Lock (DR-061) is ORTHOGONAL: effective
 *  ability = role capability ∩ lock — consumers keep their isItemLocked
 *  checks next to these. All fields are REQUIRED (DR-114 §6-G1): a new
 *  capability must be decided by every composed mode file, with no hidden
 *  default. */
export interface ItemCapabilities {
  /** Canvas drag may move it (FrameStage move target, arrow-key nudge). */
  readonly movable: boolean;
  /** Resize handles operate on it. */
  readonly resizable: boolean;
  /** The rotation handle operates on it. */
  readonly rotatable: boolean;
  /** Canvas / keyboard deletion may remove it (rail-owned lifecycle when
   *  false — WI-163: pages are deleted from the rail, never the canvas). */
  readonly deletable: boolean;
  /** Keyboard selection-navigation may land ON it. */
  readonly navigable: boolean;
  /** The hover-affordance overlay paints for it; when false it is also
   *  skipped as a parent tier, the same way the design root is. */
  readonly hoverable: boolean;
  /** The QuickActionBar shows for it when selected. */
  readonly quickActions: boolean;
  /** Selection chrome exposes canvas handles (transform AND kind handles).
   *  false = chrome-only selection (WI-163 page-fill editing rides the
   *  contextual toolbar, not handles). */
  readonly canvasHandles: boolean;
  /** "normal" = plain click selects. "deep-only" = only the Cmd/Ctrl
   *  deep-click escape hatch selects it (WI-163), and it never joins a
   *  multi-selection via Shift-toggle. */
  readonly selectable: "normal" | "deep-only";
}

/** WI-163 / WI-164 — the single truth source for "what is this item and
 *  what may it do" (GRASP Information Expert). Absorbs the scattered
 *  `isArtboardId` / `artboardIds` predicates that each consumer used to
 *  re-implement. */
export interface RolePolicy {
  /** Role of item `id` inside `doc`. Pure — derived from the document
   *  shape, never from persisted attrs. */
  roleOf(doc: AgocraftDocument, id: string): ItemRole;
  /** Role → ability table. Capability dispatch (role × behavior) — kept
   *  separate from the EDITOR_MODES instance lookup per the workspace
   *  "DI and capability dispatch are separate registries" rule. */
  readonly capabilities: Readonly<Record<ItemRole, ItemCapabilities>>;
}

/** Convenience: the capabilities of item `id` under `roles`. The one-liner
 *  every consumer would otherwise repeat. */
export function capabilityOf(
  roles: RolePolicy,
  doc: AgocraftDocument,
  id: string,
): ItemCapabilities {
  return roles.capabilities[roles.roleOf(doc, id)];
}

/** WI-153 P2 / DR-114 — what renders on the canvas and how the page reads
 *  as chrome. Absorbs the `visibleFrameIds` memo, the matte/clip keying and
 *  the active-page inference that used to hang off `infiniteCanvas`. */
export interface ViewPolicy {
  /** Which top-level frames render on the canvas. `undefined` = all of them
   *  (free placement). Page-bounded flavors return `{ activePageId }` — one
   *  page at a time. A future doc-page page-STACK is a new piece returning
   *  every page id (DR-114 §7) — consumers are unchanged because this is a
   *  function, not a flag. */
  visibleFrames(
    doc: AgocraftDocument,
    activePageId: string | undefined,
  ): ReadonlySet<string> | undefined;
  /** The page is the editing CONTEXT chrome: paint the matte + page-edge
   *  clip around the visible page, track an active page (rail click /
   *  agent zoom switch it), and base-fit INSIDE the header/rail chrome.
   *  False = free-placement plane (no page concept on the canvas). */
  readonly pageChrome: boolean;
  /** Arm the IntersectionObserver viewport culling (WI-058) — worth it when
   *  frames can live far off-screen. Kept separate from `pageChrome`: a
   *  doc-page page-stack would want chrome AND culling (DR-114 §7), so this
   *  is not derivable (§6-G5 check passed). */
  readonly viewportCulling: boolean;
}

/** Camera pan offset + zoom scale, in screen px / unitless scale — the same
 *  triple `vm.camera` carries. */
export interface CameraPan {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
}

/** Design-plane pixel box (the `DesignBox` shape FrameStage's camera fit
 *  consumes). */
export interface CameraFitBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** WI-153 P2.5 / WI-157 / DR-114 — what the camera is allowed to do.
 *  Absorbs `cameraEnabled`, `panActive`'s mode gate, `paddingFactor` and the
 *  WI-157 page-fit. */
export interface CameraPolicy {
  /** The design-px box the camera should auto-fit when the active page
   *  changes, or `undefined` for "no camera move" (free placement always;
   *  page-bounded when the page IS the design plane — FULL_FRAME). */
  fitBox(
    doc: AgocraftDocument,
    activePageId: string | undefined,
    designWidth: number,
    designHeight: number,
  ): CameraFitBox | undefined;
  /** Constrain a proposed user pan/zoom. Identity = free pan. A function,
   *  not an enum (DR-114 §6-G3): the expected doc-page "vertical pan only"
   *  is a new piece, with zero consumer edits. Applied to USER camera
   *  writes (wheel pan/zoom, zoom hotkeys) — programmatic fits (fitBox /
   *  zoom-to-frame) are policy output already and bypass it. */
  clampPan(current: CameraPan, proposed: CameraPan): CameraPan;
  /** Base-fit breathing room (1 = fill the available box). */
  readonly paddingFactor: number;
  /** User-driven zoom/pan channel (ctrl/⌘+wheel zoom, ⌘± hotkeys, wheel
   *  pan). Also what keeps the trackpad back-swipe suppressed — the
   *  non-passive wheel listener only attaches when true. */
  readonly userZoom: boolean;
  /** Drag-to-pan gestures (Space-hold / hand tool, incl. the V/H hotkeys
   *  and the header tool group). Distinct from `userZoom` (page-bounded
   *  keeps wheel zoom but has no hand tool) and not derivable from
   *  `clampPan` (a vertical-pan doc-page would drag-pan with a clamping
   *  piece). P4's InputPolicy.bindings reads this for gesture mounts. */
  readonly dragPan: boolean;
}

/** WI-153 P3 (DR-111 D5) / DR-114 — where a selection-less add lands.
 *  Absorbs FORMAT_EDITOR_CONFIG.defaultContainer for use-item-add AND
 *  agent-page-target (both receive the RESOLVED id — they stay policy-free). */
export interface InsertionPolicy {
  /** Container for an add when nothing (or a non-frame) is selected.
   *  `undefined` = design root. Page-bounded flavors return the active
   *  page (root is page chrome there, not an editing surface). */
  containerFor(doc: AgocraftDocument, activePageId: string | undefined): string | undefined;
}

/** DR-114 §4 — how the bottom rail is composed. The ThumbnailPanel does NOT
 *  know this policy: the DesignPage call site reads it and fills/empties the
 *  panel's existing optional props (the "no prop → no render" slots are
 *  already declarative). Booleans here are pass-through gates, not consumer
 *  branches (§6-G3 allowed form). */
export interface RailPolicy {
  /** Render the rail at all. (Expected: a productized canvas-board has no
   *  page concept → false candidate, DR-114 §7.) */
  readonly visible: boolean;
  /** Render the non-slide (deck-excluded frames) section. */
  readonly nonSlideSection: boolean;
  /** WI-072 deck-membership toggle (DeckGlyph). Meaningless without the
   *  non-slide section. */
  readonly slideToggle: boolean;
  /** WI-039 eye focus-cycle (dim / isolate). Meaningless when only one page
   *  renders at a time. */
  readonly focusCycle: boolean;
  /** WI-153 P2 trailing "+" new-page tile. */
  readonly addPage: boolean;
  /** WI-155 per-page duplicate footer action. */
  readonly duplicatePage: boolean;
  /** Rail tile click switches the active page (WI-153 P2). */
  readonly clickActivatesPage: boolean;
}

/** Modifier intent of a frame click — Figma's selection model: plain click
 *  walks parent-first, Cmd/Ctrl (`deep`) bypasses depth entirely, Shift
 *  (`toggle`) flips multi-frame membership. Closed list, frozen by the
 *  Figma model (WI-033). Lives here because it is the HitPolicy's input
 *  vocabulary; the interactions layer re-uses this type. */
export type ClickIntent = "plain" | "deep" | "toggle";

/** Inputs for resolving a click hit to the next single selection. */
export interface HitSelectContext {
  readonly intent: ClickIntent;
  /** Current single frame-selection id (a multi-selection's representative
   *  first id; shape selections → undefined). Drives the "already in
   *  context → drill to the leaf" heuristic (WI-033 A1). */
  readonly currentId: string | undefined;
  /** The active page on page-bounded flavors; undefined on infinite
   *  canvas (and on the empty-deck edge). */
  readonly activePageId: string | undefined;
}

/** Inputs for resolving a drag-start hit to its move target. The two
 *  function fields are engine seams the CONSUMER injects: layout climbing
 *  (agocraft LayoutEngine `canMove`) and capability ∩ lock admission stay
 *  owned by the stage — the policy only decides WHICH item to aim at
 *  (DR-114 v2: policies are pure; liveness arrives as arguments). */
export interface HitMoveContext {
  readonly currentId: string | undefined;
  readonly activePageId: string | undefined;
  /** Nearest ancestor whose layout permits moving its own position (a
   *  flex/grid-managed child climbs to its container — Figma parity). */
  climbToMovable(id: string): string;
  /** Capability (RolePolicy.movable) ∩ lock (DR-061) admission of the
   *  climbed target. */
  admit(id: string): boolean;
}

/** WI-166 P3 / DR-114 §3 — how a pointer hit resolves to a select target
 *  (click) and a move target (drag start). Absorbs `selectFromHit`'s
 *  contextRootId branch and FrameStage's deepest-`[data-frame-id]` move
 *  resolution. Routing BOTH through one policy is what produces the
 *  one-gesture select+move on page-bounded flavors: `commitFrame` already
 *  selects the move target once per gesture (`moveSelectionSessionRef`),
 *  so resolving the move target parent-first makes a drag on an unselected
 *  deep child select+move its page-direct ancestor in a single gesture. */
export interface HitPolicy {
  /** Next single selection for a click hit, or null = background click /
   *  hit outside the doc. The consumer disambiguates the two nulls: a hit
   *  ON the active page clears the selection (Canva: clicking the page
   *  deselects), an unknown id falls back to the raw target (legacy). */
  selectTarget(hitId: string, doc: AgocraftDocument, ctx: HitSelectContext): string | null;
  /** Move target for a drag starting on an UNSELECTED item, or null =
   *  decline the move (the drag falls through to the rubber band). Drags
   *  starting INSIDE the current selection never reach this — they move
   *  the selection itself (stage-owned redirect, flavor-independent). */
  moveTarget(hitId: string, doc: AgocraftDocument, ctx: HitMoveContext): string | null;
}

/** The composed per-flavor editor context. One composition file per flavor
 *  under `modes/`, resolved through the EDITOR_MODES registry — a new
 *  flavor is one composition file + one registry row (DR-114 §6-G6). */
export interface EditorModeContext {
  readonly mode: CanvasMode;
  readonly roles: RolePolicy;
  readonly view: ViewPolicy;
  readonly camera: CameraPolicy;
  readonly insertion: InsertionPolicy;
  readonly rail: RailPolicy;
  readonly hit: HitPolicy;
}
