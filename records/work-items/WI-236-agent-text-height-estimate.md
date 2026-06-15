# WI-236 — Measurement-lite height for agent-added flex-column text

## Metadata

| Field | Value |
|---|---|
| ID | WI-236 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | IN PROGRESS (impl + headless tests; live verify pending) |
| Type | Agent add-path content sizing (text height) |
| Decision | [DR-151](../decisions/DR-151-agent-text-height-estimate.md) |

## Problem

weave has no text auto-height (removed — `TextBlock.tsx` L11-17). The agent guesses
`frame.height` and gets it wrong both ways on the SAME slide (selection 10): a
2-line title clipped (box 40 / need 80) AND a heading ballooned (box 450 / need 39).
Only a content-sizing step fixes it (the architecture intends one but the agent-add
path lacks it).

## Change (option B — measurement-lite, one-shot at add)

- `apps/web/src/features/aku/agent/agent-text-resize.ts`:
  - `estimateTextHeightRatio(...)` — `\n`-line count + wrap estimate → `contentPx`
    → ratio of the container's px height (capped).
  - `containerAbsPx(doc, id, canvasW, canvasH)` — root→container ratio walk × canvas.
  - `fixAgentTextBox(name, input, doc, design?)` — for flex-COLUMN text, set
    `frame.height` to the estimate (override the agent guess), keep `FLEX_COL_TEXT`
    (basis:auto reads it). Fall back to WI-235 share when canvas/container px is
    unresolvable.
- `apps/web/src/features/aku/agent/use-aku-agent.ts` — pass `design` into the call.

## Scope

Flex COLUMN text only. Flex ROW + GRID table row-track sizing → WI-237 (separate).

## Verification

- Headless unit tests for the estimator math + the flex-col height stamp.
- **Live verify pending**: regenerate → console box/need table `fits:true` for
  column text; hero title no longer clips, headings no longer 450px. Revert is
  clean (weave-only) if it regresses.
