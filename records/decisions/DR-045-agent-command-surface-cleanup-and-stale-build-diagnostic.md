# DR-045 — agent command-surface cleanup + stale-build diagnostic

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (cleanup + diagnostic, no WI)
- **Relates:** WI-063 (the AGENT_HIDDEN_COMMANDS consolidation), DR-030 (use-aku-agent deps)

## Context

A reported runtime error — `{ code: "command-not-found", message: 'No command registered
with name "weave.item.add"' }` — prompted an audit of the agent's exposed command surface.

Finding: this is **not** a command-surface/config bug. `weave.item.add` is registered
(`commands.ts` `buildWeaveCommands` → `registerWeaveCommands`), exposed to the agent
(`withoutPresetCommands` hides only `weave.preset.*` + `AGENT_HIDDEN_COMMANDS`, and it is in
neither), and schema'd (`WEAVE_COMMAND_SCHEMAS`). apps/web pins a single `@agocraft/editor`
version, so there is no dual `CommandRegistry` instance. A runtime "not registered" therefore
means the **running bundle is out of sync with source** (stale dev server / not rebuilt), or the
resolved registry instance is not the one `registerWeaveCommands` populated — both environmental,
not fixable by editing the surface.

## Decision

1. **Surface cleanup** (the agent must reach only design-appropriate commands):
   - Hide `weave.doc.reset` from the agent (added to `AGENT_HIDDEN_COMMANDS`). It wipes the
     ENTIRE document; a generation agent must never reset the user's work. No agent prompt
     references it, so hiding is safe; the editor keeps it for UI.
   - Remove the dead `weave.items.align` label (the command was subsumed into
     `weave.items.update`; the lingering label backed no command/schema/tool).
2. **Stale-build diagnostic**: a DEV-gated `console.debug("[aku commands] exposed to agent", …)`
   at the `commands` memo logs `count` / `hasItemAdd` / `names` the agent is actually given at
   connect time, to distinguish "registry didn't get the command" from "executor used a
   different registry" the next time the error appears. Production never logs (`import.meta.env.DEV`).

## Scope (edits)

- `apps/web/src/features/aku/agent/use-aku-agent.ts` — `AGENT_HIDDEN_COMMANDS` += `weave.doc.reset`
  (− dead `weave.items.align`); DEV diagnostic effect after the `commands` memo.
- `apps/web/src/features/aku/agent/weave-command-schemas.ts` — removed the dead
  `weave.items.align` label.

biome clean (1 pre-existing unrelated warning); apps/web typecheck green.

## Consequences

- The design agent can no longer reset the whole document; the exposed surface is tidier.
- Next time the command-not-found error appears, the DEV log pinpoints whether registration or
  registry-resolution is at fault. The fix for the reported instance is to rebuild/restart the
  running bundle.
