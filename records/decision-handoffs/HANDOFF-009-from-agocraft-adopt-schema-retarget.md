# HANDOFF-009 — from agocraft → weave: adopt `retargetCommandSchemas`, drop hand-copied kit schemas

> **STATUS: ACCEPTED & IMPLEMENTED (2026-06-05)** — adopted in-session. weave now re-exposes 5 kit
> commands (`item.remove`, `item.reparent`, `clipboard.copy`, `clipboard.cut`, `item.duplicate`) via
> `retargetCommandSchemas`; `weave-command-schemas.kit.test.ts` is the drift guard (4 tests).
> Suite green (102/102), tsc clean. The other kit-derived commands stay inline (renamed key or extended
> shape — see DR-039 § Implementation status). Vendor bumped to `agocraft-agent-client-1.0.0-rc.20260605120000.tgz`.

- Date: 2026-06-05
- From: agocraft (owner of `@agocraft/agent-client`)
- To: weave (owner of `apps/web/src/features/aku/agent/weave-command-schemas.ts`)
- Source decision: agocraft `records/decisions/DR-039-agent-schema-namespace-retarget-facade.md`
- Trigger: `/facade-sdk-mcp-review` of the agocraft ↔ weave boundary (2026-06-05)

## Why you're getting this

`weave-command-schemas.ts` (1093 lines) hand-copies ~12–15 agent-command schemas from agocraft's `AGENT_COMMAND_SCHEMAS` so your `weave.*` names carry the identical kit contract — your own header comment (lines 11–15) says so. Because the copy has **no compile-time link** to the source, an agocraft kit change silently rots it. DR-038 (agent-schema prose compaction) was exactly such a change. This will keep happening on every vendor bump.

The rest of the file (chart, dataset, qr, image, video, text, frame.setLayout, shape.\*, line.\*, preset, behavior, design.\*) is genuinely weave-specific and **stays** — do not move it to agocraft.

## What agocraft will ship (additive, minor bump to `@agocraft/agent-client`)

A pure helper alongside the existing `mergeCommandSchemas`:

```ts
retargetCommandSchemas(
  { prefix: string, only?: string[], patch?: Record<string, (spec) => spec> },
  base = AGENT_COMMAND_SCHEMAS,
): Record<string, AgentCommandSpec>
```

It re-exposes selected canonical kit contracts under your namespace (`item.remove` → `weave.item.remove`), with an optional per-key `patch` to append your domain notes. See DR-039 § Proposed facade for the full signature, contract tests, and the build-time invariants (unknown `only`/`patch` keys fail loudly — that is the drift alarm you want).

## What weave should do (once the helper lands in a vendor bump)

1. Replace the ~12–15 hand-copied kit blocks (remove / reparent / dissolve→`frame.removeKeepingChildren` / duplicate / clipboard copy+cut+paste / reorder / z-order bringForward+bringToFront+sendBackward+sendToBack) with a single `retargetCommandSchemas({ prefix: "weave.", only: [...], patch: {...} })` call.
2. Keep your weave-specific schemas as-is; compose via `mergeCommandSchemas(WEAVE_SPECIFIC, retargeted)` so weave-specific wins on any key collision.
3. Add a unit test asserting every `only` key resolves against the vendored `AGENT_COMMAND_SCHEMAS` — this turns the next agocraft kit-contract change into a weave build failure instead of silent drift.
4. Verify the agent-tool coverage test still passes (`connectAgocraftAgent({ schemas })` precedence unchanged).

## How to record the outcome

Issue your own Work Item + Decision Record in weave's `records/`, or — if you decline / defer / want changes to the helper shape — write a handoff back into agocraft's inbox at `workspace/agocraft/records/decision-handoffs/`. No agocraft work starts on the helper until weave confirms the shape fits (the `only`/`patch` ergonomics are driven by your real call site).

## Scope guard

This handoff covers **only** the agent command-schema copy. The rest of the agocraft ↔ weave boundary was reviewed and found healthy (tree utils, command registry, serializer are correctly consumed, not duplicated) — no action needed there.
