// 아쿠 (Aku) — apply the agent-only input guards through a `weave.batch` (WI-226).
//
// PROBLEM: the agent's `transformInput` (round-grouping proxy) stamps the
// agent-only guards (enforceGridCapacity → growToFit, container-is-frame,
// min-size, text-box fix) keyed on `commandName === "weave.item.add"`. But a
// `weave.batch` op calls the INTERNAL command DIRECTLY (commands.ts batch.run →
// cmd.run(ctx, op.input)), bypassing this transform — so a BATCHED grid build
// never received `enforceGridCapacity`, the engine grid-grow (gated on
// `growToFit`) never ran, and authored cells clamped onto the last cell and
// STACKED (the live "1-row grid, last-column dump"). The per-op add path was
// already fixed; this closes the same gap for the batch path.
//
// FIX: a pure router — for a `weave.batch` input, run the same per-op guard chain
// on EACH inner op (normalizing `weave_x` → `weave.x` so the dot-keyed guards
// fire, while keeping the op's own `command` untouched for the batch to resolve).
// A non-batch command is guarded as-is.

/** A per-command input guard chain: `(commandName, input) => guardedInput`. */
export type GuardOne = (commandName: string, input: unknown) => unknown;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Normalize an agent op command name to the dot form the guards match. */
function dotName(raw: unknown): string {
  return String(raw ?? "").replace(/_/g, ".");
}

/**
 * Guard `input` for `commandName` with `guardOne`. When `commandName` is a
 * `weave.batch` (dot or underscore form) carrying an `ops` array, guard EACH
 * inner op's `input` instead (the op's `command` is preserved). Pure.
 */
export function applyAgentGuardChain(
  commandName: string,
  input: unknown,
  guardOne: GuardOne,
): unknown {
  if (
    (commandName === "weave.batch" || commandName === "weave_batch") &&
    isRecord(input) &&
    Array.isArray(input.ops)
  ) {
    const ops = (input.ops as ReadonlyArray<unknown>).map((op) => {
      if (!isRecord(op)) return op;
      return { ...op, input: guardOne(dotName(op.command), op.input) };
    });
    return { ...input, ops };
  }
  return guardOne(commandName, input);
}
