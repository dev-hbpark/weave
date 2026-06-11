// WI-166 / DR-114 — EditorModeContext: per-flavor editor policy composition.
//
// THE ONLY FILE CONSUMERS MAY IMPORT from `editor-mode/` (DR-114 §2b).
// Consumers (FrameStage, NestedFrame, selection-context, FSM gates, the rail
// host, use-item-add, the Aku agent bridge, PresentPage …) depend on the policy
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
// (one-gesture select+move on page-bounded flavors); P4 added input
// (the FSM gate tables out of interaction-mode.tsx).
// A policy stub without consumers would be a second truth source next to the
// live branch it is meant to absorb — exactly the dead-config drift §6-G5
// forbids, so keys land with their consumers, never ahead of them.

import type { AgentCommandSpec } from "@agocraft/agent-client";
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
   *  piece). The single truth for pan-family gesture MOUNTS too — the
   *  DesignPage hand-tool hook arms off this directly; P4 deliberately
   *  did NOT mirror it into InputPolicy (§6-G5, see InputPolicy doc). */
  readonly dragPan: boolean;
}

/** WI-153 P3 (DR-111 D5) / DR-114 — where a selection-less add lands.
 *  Absorbs FORMAT_EDITOR_CONFIG.defaultContainer for use-item-add and the
 *  agent surface's AgentHostContext (both receive the RESOLVED id — they
 *  stay policy-free; DR-115 §2a: no dual truth for the active page). */
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
  /** Per-page delete footer action (rail-side page removal). The panel hides
   *  it when only one page remains — a deck always keeps ≥ 1 page. */
  readonly deletePage: boolean;
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

/** The canvas interaction FSM's mode vocabulary (single token machine in
 *  `interactions/interaction-mode.tsx` over the vm's `mode` Signal). Lives
 *  here because it is the InputPolicy's gate vocabulary — the same way
 *  ClickIntent lives here for HitPolicy; the interactions layer re-exports
 *  it for its legacy call sites. Closed union: a mode is an FSM state with
 *  claim/release semantics, not a per-flavor concept — flavors vary which
 *  gates ADMIT a mode (InputPolicy), never the machine itself. */
export type InteractionMode =
  | "idle"
  | "hand"
  | "panning"
  | "rubber-band"
  | "frame-manipulating"
  | "context-menu"
  | "text-editing";

/** WI-166 P4 — the named pointer-affordance gates the FSM exposes. One key
 *  per `useXAllowed()` hook in interaction-mode.tsx; the hook is the single
 *  consumer of its row (callers keep calling the hook — DR-114 §2b manual
 *  injection ends at the hook layer, not at every call site). */
export type InteractionGateKey =
  /** Cursor tooltip surfaces (useTooltipsAllowed). */
  | "tooltips"
  /** Click-to-pick / marquee / multi-select toggle (useFrameSelectionAllowed). */
  | "frameSelection"
  /** Hover outline, parent/sibling highlight, quick-action surfacing
   *  (useEditAffordancesAllowed — ∩ peek-off, the peek axis stays in the
   *  hook: it is a weave product surface, not a flavor policy). */
  | "editAffordances"
  /** Resize/rotate handles + outline (useSelectionChromeVisible — ∩ peek-off). */
  | "selectionChrome"
  /** Frame-body / handle gesture binding REGISTRATION (useFrameDragBindingsAllowed
   *  — ∩ peek-off). NOTE the set is an allow-list where the old hook was a
   *  block-list (`mode !== hand/panning/context-menu`): with the closed
   *  InteractionMode union the two are equivalent, but a NEW mode now
   *  defaults to "bindings stand down" — when adding a mode the FSM
   *  enters *via these bindings' own claims* (like rubber-band /
   *  frame-manipulating / text-editing), it MUST be added to this set or
   *  the in-flight gesture's closure is orphaned mid-drag. */
  | "frameDragBindings";

/** WI-166 P4 / DR-114 — which FSM modes admit each pointer affordance.
 *  Absorbs the hardcoded mode lists that lived inside the
 *  interaction-mode.tsx gate hooks. **The FSM stays a single machine** —
 *  transition logic and claim-token bookkeeping are flavor-independent;
 *  the policy only decides the admissible set per gate.
 *
 *  The plan's `bindings` half (per-flavor gesture-layer MOUNTS) was folded
 *  during P4 instead of landing as a key (§6-G5): the pan-family mount
 *  already rides `CameraPolicy.dragPan` (P2 — duplicating it here would be
 *  a second truth source), and the rubber-band / marquee layers are
 *  mounted on every flavor with their flavor-awareness in START
 *  acceptance (ViewPolicy-scoped page bounds + the `frameSelection` gate).
 *  A flavor that must NOT MOUNT a layer is the moment a `bindings` key
 *  lands — with that consumer, in the same change (G1). */
export interface InputPolicy {
  readonly gates: Readonly<Record<InteractionGateKey, ReadonlySet<InteractionMode>>>;
}

/** WI-168 / DR-115 — host runtime values an agent-tool adapter may consult.
 *  Policies stay pure (DR-114 v2 change ③): the React layer builds this per
 *  exec from live refs. `activeContainerId`'s value SOURCE is
 *  InsertionPolicy.containerFor — the host context only transports it
 *  (DR-115 §2a: no dual truth for the active page). */
export interface AgentHostContext {
  readonly rootId: string;
  /** Active page id (page-bounded; infinite = undefined). */
  readonly activeContainerId: string | undefined;
}

/** WI-168 / DR-115 — one agent-exposed tool = an adapter over an internal
 *  command. `exposedName` may differ from `command` (a wrapped tool such as
 *  `weave.page.add`). `mapInput` is a PURE function — host runtime values
 *  arrive via the AgentHostContext argument. `schema` is a function of the
 *  internal command's base spec so composition files never import the
 *  app-layer schema catalogue (the façade passes the base in). */
export interface AgentToolAdapter {
  readonly exposedName: string;
  /** Internal weave.* command (execution truth — Rule 4 unchanged). */
  readonly command: string;
  /** Exposure schema/description overlay; receives the internal command's
   *  base spec (undefined when the catalogue has none). */
  readonly schema?: (base: AgentCommandSpec | undefined) => AgentCommandSpec;
  readonly mapInput?: (input: unknown, host: AgentHostContext) => unknown;
  /** WI-169 — a PAGE-CREATING tool: an ok exec result (the new page's id)
   *  makes that page the ACTIVE page, synchronously at exec (rail-"+"
   *  parity). Declarative — the façade interprets it through an injected
   *  host callback; pieces stay pure. Without this the agent builds into a
   *  page that never renders (activePageOnly) and the next omitted-container
   *  add races the debounced WI-153 P4 zoom-activation onto the OLD page. */
  readonly activatesPage?: boolean;
}

/** WI-168 / DR-115 — the flavor-fit agent command surface. The internal
 *  command registry stays single (Rule 4 / History contract); only what the
 *  agent SEES is policy. `"all"` = the full registered surface, unchanged
 *  (DR-064 stays valid for free-placement flavors). An explicit list is a
 *  CLOSED allow-list: a command not listed does not exist for the agent —
 *  unsupported operations are unrepresentable rather than guarded after the
 *  fact (the WI-167 recurrence class, removed structurally). New commands
 *  must be enlisted per flavor (or deliberately left off) — omission fails
 *  safe as "not exposed" (DR-115 §5). */
export interface AgentSurfacePolicy {
  /** `"all"` = pass-through of every registered command. Otherwise a closed
   *  allow-list: string = unchanged pass-through, adapter = wrapped tool. */
  readonly tools: "all" | ReadonlyArray<string | AgentToolAdapter>;
  /** Flavor-specific system-prompt fragment (absorbs the hardcoded
   *  pageLine). Empty/omitted = no fragment. */
  readonly promptFragment?: (host: AgentHostContext) => string;
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
  readonly input: InputPolicy;
  readonly agent: AgentSurfacePolicy;
}
