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
// consumers (G1/G2). P1 ships `mode` + `roles`; ENGINEERING_PLAN P2 adds
// view / camera / insertion / rail, P3 hit, P4 input. A policy stub without
// consumers would be a second truth source next to the live branch it is
// meant to absorb — exactly the dead-config drift §6-G5 forbids, so keys
// land with their consumers, never ahead of them.

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

/** The composed per-flavor editor context. One composition file per flavor
 *  under `modes/`, resolved through the EDITOR_MODES registry — a new
 *  flavor is one composition file + one registry row (DR-114 §6-G6). */
export interface EditorModeContext {
  readonly mode: CanvasMode;
  readonly roles: RolePolicy;
}
