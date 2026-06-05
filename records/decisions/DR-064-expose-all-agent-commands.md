# DR-064 — Expose every weave command to the agent (no hidden commands)

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-095
- **Relates / supersedes:** WI-063 (the consolidation that HID the redundant
  setters — its consolidated commands remain the preferred path, but the hiding is
  lifted), WI-064 (multi-selection absorption), DR-009 / WI-054 (agent command +
  schema surface), WI-090 / DR-052 (item-link behavior), WI-094 / DR-063 (partial
  text/chart edits — same agent-surface line of work)
- **Operator directive (2026-06-05):** "히든 커멘드를 모두 공개 커멘드로 바꿔줘"
  + "모델을 편집할 수 있는 방식 중에 커멘드로 제공하지 않고 있는지도 검사해줘."
  Answer to AskUserQuestion: **전부 공개 (요청대로)**.

## Context

`use-aku-agent.ts` wrapped the command registry in `withoutPresetCommands`, hiding
11 commands from the agent tool list:

- **Subsumed setters** (WI-063): `shape.setFill`, `shape.setCornerRadius`,
  `shape.setVertices`, `item.setDecoration`, `image.setCrop`, `item.flip` — every
  one reachable via `weave.item.add` / `weave.item.update` (attrs + units).
- **Multi-selection legacy** (WI-064): `items.resizeMulti`, `items.remove`,
  `items.duplicate` — reachable via `items.update` / `items.lifecycle`.
- **`doc.reset`** — destructive (wipes the document).
- **`preset.*`** — the agent guessed invalid presetIds → `preset-not-found`.

So the hidden set was REDUNDANT-or-RISKY, not capability the agent lacked. The
operator nonetheless wants the full surface advertised.

## Decision

1. **Remove all hiding.** Drop `AGENT_HIDDEN_COMMANDS` + `AGENT_HIDDEN_COMMAND_PREFIX`
   + `withoutPresetCommands`; the `commands` memo resolves the registry directly, so
   the reverse-MCP bridge advertises `list()` verbatim — every registered command is
   an agent tool.
2. **Give every re-exposed command a curated schema** in `WEAVE_COMMAND_SCHEMAS`:
   un-comment the 7 setter/legacy schemas; ADD the two that never had one
   (`image.setCrop`, `item.flip`); give `preset.insertSlide` a **closed presetId
   enum (25 ids)** so the agent can't guess an invalid id (the original reason
   presets were hidden). Each re-exposed setter's note states it is also reachable
   via the consolidated command (so the agent knows they're alternatives, not the
   only path).
3. **Coverage guard test** — `weave-command-schemas.coverage.test.ts` builds the
   real command set and asserts EVERY registered command has a schema (locks "no
   hidden" against drift) + the preset enum has 25 ids.

## Audit (second half of the directive)

Every document mutation in weave routes through an `editor.exec("weave.*")` command
(the project's History rule, apps/web/CLAUDE.md). Cross-checking all `exec` call
sites and the registered set: **there is no editing path without a command, and —
after this change — no command the agent cannot use.** One genuine *documentation*
gap surfaced (capability + command existed, but the agent was uninformed): the
**item-link** (`button-trigger` behavior, WI-090 — URL open / slide jump) was set
via the already-exposed `addBehavior` but absent from the capabilities unitKinds.
Added a `button-trigger` unitKind entry (HotspotAction: `external` href /
`jump-camera` `present-<frameId>`) so the agent can author item links.

## Follow-up (2026-06-05) — per-command descriptions actually reach the agent

Operator: "모든 항목에 대해 적절한 설명이 에이전트에 전달되도록 정리되어 있나?" Audit
(runtime introspection of `WEAVE_COMMAND_SCHEMAS`) found it was **not**: the
reverse-MCP tool's own `description` falls back to the bare command NAME
(`AgentCommandSpec` carries no description field; `command-bridge` uses
`d.description ?? d.name`), and **no command had a top-level `inputSchema.description`**
— so ~18 commands (z-order, swap, clipboard, behaviors, design-level, doc.reset,
and several re-exposed setters) delivered only their name. The rich notes only rode
on the `attrs` property of add/update.

Fix: a top-level `description` on EVERY command's `inputSchema` (the one channel
that reaches the agent — confirmed via `schemas.ts` guidance "add a domain note to
inputSchema.description"). The `obj()` helper gained an optional `description` arg;
all 39 inline commands pass one; the 5 retargeted kit commands get one via a new
`withKitDesc` patch (argument shape still by import, description added). The
coverage guard now also asserts every command has a non-empty
`inputSchema.description`. (Code `//` comments do NOT reach the agent — they were
never the delivery channel.)

## Consequences

- (+) The agent has the FULL editing vocabulary — targeted setters, multi-select
  legacy, presets (valid ids), reset, and item links.
- (+) Coverage guard prevents a future command shipping without an agent schema.
- (−) Re-introduces redundancy the WI-063 consolidation removed (two ways to set
  fill / corner-radius / etc.). Mitigation: each setter's note points to the
  consolidated command; the consolidated commands stay the documented preferred
  path. Revisit if agent quality regresses from tool-choice ambiguity.
- (−) `doc.reset` is now agent-reachable (wipes the document). It is marked
  `destructive` so clients gate it; the round-grouping editor keeps each agent
  round one undo step.

## Verification (SVL gate)

`@weave/web`: typecheck clean; aku-agent suites + `commands.test.ts` 113 pass incl.
the new coverage guard (every registered command has a schema; preset enum = 25);
biome clean on changed files. Rule-6 gate: pre-existing 3 only (WI-093), none added.
