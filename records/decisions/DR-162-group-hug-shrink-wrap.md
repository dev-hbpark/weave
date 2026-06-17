# DR-162 — Group shrink-wrap (hug): a group always equals its children's union box

## Metadata

| Field | Value |
|---|---|
| ID | DR-162 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | ACCEPTED — built + e2e live-verified |
| Work Item | [WI-245](../work-items/WI-245-group-hug-shrink-wrap.md) |
| Builds on | [DR-158](DR-158-domain-kind-structure-spec.md) (`structure`), [DR-159](DR-159-group-kind-structural-verbs.md) (group kind + verbs) |
| Note | Numbers DR-160 / WI-243 were taken by a concurrent session (per-item-content-viewmodel); this work uses DR-162 / WI-245 (committed-wins). |

## Context

The operator: "그룹은 프레임과 다르게 내부아이템들을 감싸는 아웃바운드를 항상 유지해야하고 자식아이템들의 오버플로우를 허용하지 않아야해." A `group` must **always** keep a bounding box that wraps its children, and children must **not overflow**.

These are one mechanism, not two: if the group's frame is **always** the union bbox of its children (a shrink-wrap / Figma group), a child can never extend past the box — overflow is impossible by construction. A `frame`, by contrast, is an independent box that does not follow its children.

## Decision

### 1. `structure.hugsChildren` declares the behavior (registry, not `kind==="group"`)

Add `hugsChildren: boolean` to the container `StructureSpec` (DR-158). `frame: false` (independent box, overflow allowed), `group: true` (shrink-wrap). A new container kind must consciously choose; the refit reads the flag, never branches on kind.

### 2. A weave-level refit (the engine Hug does not apply)

The engine's Hug (`refitHugContainer`) is flex/grid-layout specific. A group has **absolutely-positioned** children, so it needs a new weave-level refit: `apps/web/src/document/layout/refit-group.ts`.

- `refitGroupFrames(groupFrame, children)` — pure ratio math. Children's parent-relative frames compose to absolute boxes in the group's PARENT space (affine, no design-px needed); their union becomes the new group frame; each child is re-relativized to it (absolute positions preserved, child rotation preserved; the union ignores rotation, the same caveat as `weave.items.group`).
- `groupHugPatches(doc, groupId)` — reads a hugging container, emits `item.attrs` patches for the group + each re-relativized child. Epsilon-guarded no-op when already tight (so unrelated edits don't pollute history).

### 3. Triggered as decorators on the mutating commands (same idiom as A3 dissolve)

The refit is appended in the SAME transaction as the triggering mutation, read against a working doc that already reflects it:

- **`weave.item.update`** — when the updated item is a child of a hugging group, re-fit the group (covers on-canvas move + resize, which commit via `weave.item.update { frame }`).
- **`weave.item.add`** — adding a child into a hugging group grows it to wrap the new child.
- **`weave.item.remove` / `weave.items.remove`** — extended the A3 dissolve decorator: a non-dissolving hugging group (still ≥ minChildren) shrink-wraps to its survivors.

Deferred: `weave.item.reparent` into/out of a group (less common; follow-up), and rotation-accurate union.

## Why this satisfies both requirements

"Always maintain a wrapping outbound" = the refit keeps `group.frame = union(children)`. "No overflow" = a consequence: after every refit each child's frame lies within the group's `[0,1]` box (asserted in e2e). Dragging a child "outside" simply grows the group; the child ends up inside the grown box.

## Undo / atomicity

Refit patches are `item.attrs` (group + children) in the same transaction as the move/add/remove; the editor inverts them in reverse order, so one `Cmd+Z` reverts the whole gesture. A moved child gets two frame patches in the transaction (the base move, then the re-relativization) — the net is the dragged position; undo round-trips.

## Live-gesture addendum (WI-246)

The initial wiring refit on EVERY live `weave.item.update` during a drag, which fed back into the agocraft move binding (it computes the child's frame relative to the **gesture-start** group box, cached once per gesture): the box grew tick-to-tick while the binding kept emitting frames against the start box → the child drifted and the group ballooned. Fixed with the WI-042 `hugParentBoxFor` pattern: cache the group's gesture-start frame keyed by `sessionId` and, during a live gesture, compute the **dragged** child's parent-space box from that cached `g0` (other children use the live group frame, which is stable because their re-relativized frames preserve absolute position). Non-gesture (`sessionId` undefined) updates keep the simple live-doc refit. See [WI-246](../work-items/WI-246-group-hug-live-gesture-fix.md).

## Verification

- `refit-group.test.ts` (4) — pure math: empty→null, already-tight identity, grow+re-relativize, rotation preserved.
- `commands.test.ts` — moving a group child grows the group and re-relativizes (no overflow); + the A3 dissolve/shrink suite.
- `domain-kinds.structure.test.ts` — `frame.hugsChildren===false`, `group.hugsChildren===true`.
- **e2e `group-hug.spec.ts`** — moving a child outward grows the group AND every child stays within the group `[0,1]` box (no overflow); moved child still renders.
- Full unit suite 1499 green; typecheck + biome clean; declarativecheck no new violation.
