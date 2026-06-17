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
