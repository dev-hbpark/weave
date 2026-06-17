// WI-249 / DR-164 — transaction effect contract.
//
// A `TransactionEffect` derives the CONSEQUENT patches of a command's PRIMARY
// patches (layout relayout, group-hug refit, group dissolve, …). Commands emit
// primary patches only; the pipeline runs the registered effects so authors never
// hand-append cross-cutting side-effects. Extensible by registration (Open-Closed):
// adding an effect = a new module + one entry in the pipeline registry — no edit
// to the runner or to any command.

import type { CommandContext, Patch } from "@agocraft/core";
import type { Result, WeaveError } from "../result.js";

/** Command-level hints an effect may need that the patches don't carry (live
 *  gesture session, design basis for fixed-px gap/padding). */
export interface EffectMeta {
  readonly sessionId?: string;
  readonly designWidth?: number;
  readonly designHeight?: number;
}

export interface TransactionEffect {
  readonly name: string;
  /** `patch.type` values this effect reacts to — lets the pipeline skip it
   *  cheaply and documents the trigger. */
  readonly reactsTo: ReadonlyArray<string>;
  /** WI-250 / DR-166 — set when this effect re-derives the SAME engine reflow a
   *  command may already perform INLINE (i.e. it calls the layout engine the same
   *  way the command did). The central runner suppresses such an effect when the
   *  command's output already carries engine-derived patches (`isReflowDerived`):
   *  a self-reflowing command (add / reparent / resizeHug / items.update) emits
   *  its own reflow, so re-deriving it here would double / conflict. Weave-side
   *  effects that a command does NOT self-manage (group-hug, group-dissolve) leave
   *  this false, so they still attach universally. */
  readonly skipWhenSelfReflowed?: boolean;
  /** Derive consequent patches from the PRIMARY patches (+ meta). PURE; returns
   *  `ok([])` when nothing applies; MUST NOT react to its own output (loop-free —
   *  reacts to PRIMARY patch kinds only). Declarative errors: an effect that can
   *  fail returns a typed `WeaveError` (DR-165 (A) channel) — the pipeline
   *  short-circuits and the command maps it to a `fail`. */
  derive(
    ctx: CommandContext,
    patches: ReadonlyArray<Patch>,
    meta: EffectMeta,
  ): Result<ReadonlyArray<Patch>, WeaveError>;
}
