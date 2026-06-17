# DR-164 — Transaction effect pipeline: cross-cutting side-effects auto-derived, command authors don't append them

## Metadata

| Field | Value |
|---|---|
| ID | DR-164 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **PROPOSED (design only — no code yet; build is HANDOFF-003 / coordinated)** |
| Work Item | [WI-248](../work-items/WI-248-transaction-effect-pipeline.md) |
| Handoff | [HANDOFF-003](../handoffs/HANDOFF-003-effect-pipeline-to-group-hug-session.md) (group-hug session owns the effects to migrate) |
| Related | DR-163 (unit models + emitUnit — the unit-write analogue), [[foolproof-structure-over-brevity]], CLAUDE.md Rule 3/6 (registry of adapters, Open-Closed) |

## Problem

`emitUnit` (DR-163) made the **unit-value write** foolproof, but a command's
**cross-cutting side-effects are still appended by hand**. A command author today
must remember to call, in the right place:

- `getLayoutEngine().onFrameChanged(...)` after a frame change — `commands.ts`
  3 sites (item.update, items.update ×2 contexts).
- `groupHugAfter(...)` / `groupHugLivePatches(...)` after a hug-group child's
  geometry/unit change — 3 sites.
- `dissolveUnderflowingGroups(...)` after a removal — 2 sites (removeItem,
  removeItems).

So writing a NEW mutation command means knowing "geometry changed → also relayout
+ hug; removed → also dissolve." Forgetting one is a silent bug. This is the
remaining "developer has to be careful" gap (operator, 2026-06-17).

## Decision — a registered, patch-driven effect pipeline at the runner boundary

A command produces ONLY its **primary patches**. A pipeline of registered
**effect processors** then derives the **consequent patches** from those primary
patches and appends them in the SAME transaction. The command author declares
nothing and calls no effect function.

```ts
// One cross-cutting consequence = one effect. Self-contained, registered.
interface TransactionEffect {
  readonly name: string;
  /** Patch kinds this effect reacts to — lets the pipeline skip it cheaply and
   *  documents its trigger. */
  readonly reactsTo: ReadonlyArray<PatchKind>;
  /** Derive consequent patches from the accumulated patches (+ command meta:
   *  sessionId for live gestures, etc.). PURE; returns [] when nothing applies;
   *  MUST NOT react to its own output (loop-free). */
  derive(ctx: CommandContext, patches: ReadonlyArray<Patch>, meta: EffectMeta): Patch[];
}
```

### Extensibility is the point (Open-Closed)

The pipeline is a **registry** (`EFFECT_PIPELINE: TransactionEffect[]`), iterated
by the runner. **Adding a cross-cutting effect = implement `TransactionEffect` +
register it — zero edits to the runner or to any command** (Rule 3/6). The
initial set migrates the three that exist:

- `relayoutEffect` — reacts to `item.frame` patches → `onFrameChanged`.
- `groupHugEffect` — reacts to geometry/unit patches on a hug-group child →
  `groupHugAfter` / (live) `groupHugLivePatches`.
- `groupDissolveEffect` — reacts to `item.remove` → `dissolveUnderflowingGroups`.

Future effects plug in identically with no core change, e.g.: relation cascade,
delta-persistence boundary markers, auto-fit text re-measure, snapshot-boundary
tagging, analytics/telemetry emit. That open set is exactly why this is a registry,
not a hardcoded sequence.

### Runner integration

```ts
function runWithEffects(ctx, cmd, input, meta): CommandResult {
  const base = cmd.run(ctx, input);
  if (!base.ok) return base;
  let patches = base.patches;
  for (const fx of EFFECT_PIPELINE) {
    if (!fx.reactsTo.some((k) => patches.some((p) => p.type === k))) continue; // cheap skip
    patches = [...patches, ...fx.derive(ctx, patches, meta)];
  }
  return ok(base.value, patches);
}
```

Hooked once at the command-runner boundary (TransactionRunner / `editor.exec`
proxy), so EVERY command gets it — the foolproof property.

### Hard design constraints (must be in the build)

1. **No double-apply.** Migrating means the inline calls (8 sites) are REMOVED
   when the effect is registered — the pipeline becomes the single source. A
   transitional flag or a one-shot cutover avoids running both.
2. **Loop-free.** An effect must not react to patches it (or a later effect)
   produced. Single forward pass; each effect derives once; effects declare
   `reactsTo` on PRIMARY patch kinds, not on effect-output kinds. If two effects
   genuinely chain (relayout produces frames that hug must see), order them in the
   registry and document the dependency (ordered list, not a graph — keep it simple
   until a real cycle forces more).
3. **Ordering is explicit.** `EFFECT_PIPELINE` order is the contract (e.g.
   relayout → hug → dissolve). Documented at the registry.
4. **Live-gesture nuance survives.** `groupHugLivePatches` needs the gesture-start
   box (sessionId). Carried via `EffectMeta`, not re-discovered — so the live path
   and the one-shot path stay consistent (today's `gestureGroupG0For`).
5. **Idempotency under undo/redo.** Effects derive from patches, and undo replays
   inverses through the same reducer; verify an effect's derived patches invert
   cleanly (no orphaned hug/relayout on Cmd+Z).

## Scope boundary / coordination

This restructures effects **owned by the concurrent group-hug session**
(`groupHugAfter` / `dissolveUnderflowingGroups` / `refit-group.ts`, WI-245/246)
plus the layout `onFrameChanged` calls. Centralizing requires removing their 8
inline sites → editing their live hot code. Per the committed-wins history
(`117edde` already entangled commands.ts), **the build is NOT done unilaterally**:
HANDOFF-003 hands the design to that session to fold in (or to co-own a cutover).
This DR is design only.

## Alternatives considered

- **Per-command explicit `withEffects(cmd, [relayout, hug])` opt-in** — rejected:
  the author still chooses which effects → can forget one. Patch-driven auto-
  derivation is foolproof; opt-in is not.
- **Declared intent object (`{ geometryChanged: [...] }`) instead of patch-driven**
  — partially kept via `EffectMeta` for what patches can't express (sessionId),
  but the trigger is patch-driven so the author declares nothing in the common case.
- **Bake effects into `emitUnit` / each kit** — rejected: effects are
  transaction-level (span multiple patches/units), not unit-level; they belong at
  the runner, above emitUnit.

## Consequences

- A new mutation command produces primary patches only; relayout/hug/dissolve (and
  future effects) attach automatically — the "don't-have-to-be-careful" goal,
  extended from unit-writes (DR-163) to whole transactions.
- Adding a cross-cutting effect later = register one adapter (Open-Closed).
- The 8 scattered inline sites collapse to 3 registered effects.

## Verification (when built)

- A pipeline unit test: a fake command emitting an `item.frame` patch yields the
  relayout patches with no inline call; an `item.remove` yields dissolve patches.
- Full suite + the group-hug / dissolve / relayout e2e stay green after the
  inline→registry cutover (behaviour-neutral).
- Undo/redo e2e: derived effects invert cleanly.
