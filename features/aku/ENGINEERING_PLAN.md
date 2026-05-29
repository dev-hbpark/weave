# Aku — Engineering Plan (WI-052)

## Architecture: two swappable seams

The design centers on two seams so "mock now → real Claude later" is a drop-in,
and so design-awareness is a registry (not branching):

- **`AkuTransport` (Strategy / DIP).** `send(req, signal): AsyncIterable<AkuEvent>`,
  `AkuEvent = text-delta | tool-call | done | error`. The conversation hook depends
  on the interface only. v1 = `createMockAkuTransport`; later = `createClaudeAkuTransport`
  (fetch `/api/aku` → parse stream → same events). `transport/types.ts`, `transport/mock-transport.ts`.
- **Tool registry (Rule 6).** `createAkuTools({editor,getDocument,getSelection})` → `{ snapshot(), executors: Map<name, executor> }`. Each executor delegates to a `weave.*` command via `editor.exec` (Information Expert: the editor owns mutation; edits are undoable). Dispatch is a Map lookup, never a `switch`. `tools/aku-tools.ts`, `tools/types.ts`.

## Layers (SRP)

- Rendering: `AkuLauncher` / `AkuPanel` / `MessageList` / `AkuComposer` — feature-local, token-styled.
- State + loop: `useAkuConversation` — transcript + send→stream→tool loop; never mutates the doc itself.
- Transport: mock (real later).
- Tools: editor.exec bridge + snapshot.
- Entry: `AkuAssistant` (mounted in `DesignPage` providers) wires editor+document → toolset (refs for freshness) + transport + hook; portals launcher/panel to `<body>` (z-48).

## Design System Triage (DR-design-023)

- Reuse: `Panel`(floating), `IconButton`/`Button`, `Spinner`, `Icon`(`IconSparkle`/`IconClose`/`IconImage`), tokens.
- Grew: `Textarea` primitive (multiline; `TextField` is input-only). Extend: `IconArrowUp` (send).
- Feature-local: chat bubbles / streaming caret / edit chips / image thumbnails (app-specific, not DS primitives).

## SOLID-GRASP first-pass

- DIP: hook → `AkuTransport` interface, not concrete transport.
- OCP / Rule 6: tools = Map lookup; new capability = one entry.
- SRP: rendering / state / transport / tool-execution separated; edits only via `editor.exec`.
- Protected Variations: real model swaps behind the transport seam with zero UI/loop change.

## Verification

- weave typecheck 0; Aku files biome-clean.
- e2e `apps/web/e2e/aku-chat.spec.ts` (4): launcher open/close · streamed reply · **design-aware edit ("배경을 파랑으로") applies to document.attrs.background AND Cmd+Z reverts** · composer typing does not fire canvas hotkeys.

## Deferred

- `apps/web/api/aku.ts` (Vercel) → `@anthropic-ai/sdk` streaming + vision + tool-use loop (`createClaudeAkuTransport`).
- Access hardening before the real route ships on the shared deploy (see RISK_NOTES).
