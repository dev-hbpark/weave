// WI-249 / DR-164 — transaction effect pipeline.
//
// Commands emit their PRIMARY patches; `applyEffects` runs the registered
// effects to derive the consequent (cross-cutting) patches the caller appends —
// so a command author never hand-appends relayout / hug / dissolve. EXTENSIBLE:
// adding an effect = a new `<x>-effect.ts` + one entry in `EFFECT_PIPELINE`
// (Open-Closed; no runner/command edit), mirroring the unit registry.
//
// Single forward pass: each effect derives from the PRIMARY patches only
// (loop-free). Registry ORDER is the contract (document any dependency).
//
// Migrated so far: relayout. The group-hug + dissolve effects are owned by the
// concurrent group-hug session (HANDOFF-003) and stay inline until they register
// here — until then this pipeline only relays out, so there is no double-apply.

import type { CommandContext, Patch } from "@agocraft/core";
import { ok, type Result, type WeaveError } from "../result.js";
import { relayoutEffect } from "./relayout-effect.js";
import type { EffectMeta, TransactionEffect } from "./transaction-effect.js";

// Order = application order. (relayout first; hug/dissolve to be registered by
// the group-hug session per HANDOFF-003.)
const EFFECT_PIPELINE: ReadonlyArray<TransactionEffect> = [relayoutEffect];

/** Run the pipeline over a command's primary patches → `ok(extraPatches)` to
 *  append, or the first effect's typed `WeaveError` (DR-165 (A) channel). Caller:
 *  `const fx = applyEffects(...); if (!fx.ok) return fail(fx.error.code, fx.error.message);
 *   patches.push(...fx.value);` */
export function applyEffects(
  ctx: CommandContext,
  patches: ReadonlyArray<Patch>,
  meta: EffectMeta = {},
): Result<ReadonlyArray<Patch>, WeaveError> {
  const extra: Patch[] = [];
  for (const fx of EFFECT_PIPELINE) {
    // Cheap skip when no primary patch matches this effect's trigger kinds.
    if (!fx.reactsTo.some((t) => patches.some((p) => (p as { type?: string }).type === t))) {
      continue;
    }
    const r = fx.derive(ctx, patches, meta);
    if (!r.ok) return r; // short-circuit with the typed error
    extra.push(...r.value);
  }
  return ok(extra);
}

/** Effect names registered, in order — for diagnostics / tests. */
export function registeredEffectNames(): ReadonlyArray<string> {
  return EFFECT_PIPELINE.map((e) => e.name);
}
