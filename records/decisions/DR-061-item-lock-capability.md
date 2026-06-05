# DR-061 — Item Lock capability (protect from move/resize/rotate/delete/edit; stays selectable)

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** toolbar UX / DR-design-016 Phase 2
- **Relates:** DR-design-016 (toolbar Quick curation + QuickActionBar curation —
  this is the net-new capability that DR deferred to Phase 2), the product-UX
  전수검토, `apps/web/CLAUDE.md` "Document mutation rule" (every change via
  `editor.exec` → History).
- **Triage note:** Touches the data model (a weave-local attr) AND interaction
  gating across move / resize / rotate / delete / text-edit / reparent, plus
  selection chrome + a new `IconLock`/`IconLockOpen` (design-system). The chrome
  + icon pieces route through `design-system-agent` / DR-design-016.

## Context

The product-UX review and DR-design-016 chose **Lock (잠금)** for the
QuickActionBar, but the product has **no lock capability** today — no `locked`
attr, command, gating, or icon. Lock lets a user protect a finished element
(background, placed logo) from accidental move/resize/delete while continuing to
work around it.

Critical constraint discovered: **weave has no layers / objects panel.** So if a
locked item could not be selected on the canvas, there would be **no way to
re-select it to unlock**. Therefore lock must NOT block selection.

## Decision

### Semantics — "protect, stay selectable"

A locked item:

- **Stays selectable** (click selects it; the QuickActionBar then offers Unlock).
- Is **blocked** from: **move, resize, rotate, delete, text-edit entry,
  reparent** (the mutation gestures + destructive command).
- Is **NOT blocked** from: selection, copy/duplicate (the copy inherits
  `locked`), and z-order keyboard ops (v1 — low-risk, revisit if needed).

### Model — weave-local `locked` attr

There is no base `ItemAttrs` (attrs are per-kind unions, `ItemAttrsByKind` in
`types.ts`). Add a weave-local optional `locked?: boolean` to every kind via the
existing `ItemAttrsByKind` intersection (mirrors how `textOverflow`/`textOutline`
were added to `TextAttrs`), and a single generic accessor:

```ts
export function isItemLocked(item: { attrs: Readonly<Record<string, unknown>> }): boolean {
  return (item.attrs as { locked?: boolean }).locked === true;
}
```

Unknown to agocraft → survives serialization via `onUnknown: "preserve"`.

### Toggle — rides on `weave.item.update` (no dedicated command)

`locked` is just another attr (like `opacity`/`background`), so the toggle is
`editor.exec("weave.item.update", { itemId, attrs: { locked: !prev } })` — already
History-routed, undoable, no new command verb. A `lock`/`unlock` action is added
to the QuickActionBar registry (its `action` reads current state and flips it);
this is the unlock path.

### Gate points (smallest predicate at each surface)

| Surface | File | Gate |
|---|---|---|
| Move (target resolve) | `FrameStage.tsx` `resolveTarget` | locked → return null (decline) |
| Resize/Rotate (handle press) | `FrameStage.tsx` `onDown` | locked → return before `startHandleGesture` |
| Delete | `editor-hotkeys.ts` `frame.delete`/`multi.delete` `enabledWhen` + the deleter slot | locked (any, for multi) → disabled / skip |
| Text edit entry | `TextBlock.tsx` `onDoubleClick` | locked → return before `setIsEditing` |
| Reparent drag | `use-reparent-drag-controller.ts` `onPointerDown` | locked → return (decline) |

Gating at gesture **start** (resolveTarget / onDown / onPointerDown) is the
primary block; the math sinks are unreachable once start is declined.

### Selection chrome

A locked, selected item:

- renders a **lock badge** on the chrome,
- **hides resize + rotate handles** (they'd be inert anyway; hiding communicates
  the protected state). The selection **outline stays** so the item still reads
  as selected.

Needs new `IconLock` / `IconLockOpen` in `@weave/design-system` (none exist).

### Multi-selection

A move/resize gesture is owned by the grabbed item; if that item is locked the
gesture is declined. `multi.delete` is disabled when **any** selected item is
locked (avoids partial deletes); the user unlocks first.

## Consequences

- (+) Users can protect finished elements; the unlock path (re-select → toggle)
  works without a layers panel.
- (+) No new command verb, no agocraft change; toggle is undoable via existing
  `weave.item.update` + History.
- (+) Gating concentrated at gesture-start sites → small, auditable predicates.
- (−) `locked` must be added to all 8 kinds (intersection on `ItemAttrsByKind`)
  — mechanical.
- (−) z-order keyboard ops remain allowed on locked items in v1 (documented;
  gate their `enabledWhen` later if it bites).
- (−) Lock is per-item; locking a frame does NOT auto-lock its children in v1
  (children gate independently). Revisit if "lock subtree" is requested.

## Verification — DONE

- e2e (`e2e/item-lock.spec.ts`, ✅): select item → lock toggle → resize handles
  disappear, Delete does not remove it, double-click does not enter text edit;
  unlock → handles return and double-click enters edit.
- Unit (`item-lock.test.ts`, ✅): `isItemLocked` accessor (kind-agnostic, strict
  `=== true`).
- typecheck whole project GREEN · biome error-level clean · vitest 571 passed.
- Screenshot: locked text item shows the closed-padlock toggle in the
  QuickActionBar and a handle-less selection outline.

## Implementation note — delete had THREE entry points

Gating revealed delete is dispatched from three places, all now gated: the
`frameDeleter` slot, the `multiDeleter` slot, AND a direct
`editor.exec("weave.items.remove")` in DesignPage's window keydown
(Backspace/Delete) handler. The keydown path was the one that initially leaked
(the first e2e caught it).

## Follow-ups — now DONE (DR-design-016 Phase 2 completion)

- ✅ **On-canvas lock badge** — a small lock chip at the selection's top-left
  corner (`[data-lock-badge]`), appended to the chrome handle set in `NestedFrame`
  when locked.
- ✅ **Multi-select lock** — `item.toggleLock` `visibleWhen` now also matches
  `selectedKind === "multi"`; the host `lockToggler` operates on the WHOLE
  selection (lock all if any unlocked, else unlock all), batched into one undo.
- ✅ **QuickActionBar curation** — the lock command was moved to the END of the
  registry so the bar (registry-ordered) places lock AFTER the kind/multi primary
  actions and just before the pinned ✕ delete (fixed image/video showing lock
  before the primary replace action).
- Verified: `e2e/item-lock.spec.ts` (single + multi + badge + handle-hidden),
  typecheck GREEN, lint clean, vitest 571.

## Not done (genuine new feature, out of scope)

- **Group / wrap-into-frame for multi** — no such command exists; adding it is a
  separate feature, not a curation. Noted for a future WI.
