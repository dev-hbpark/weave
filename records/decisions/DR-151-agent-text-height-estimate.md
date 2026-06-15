# DR-151 — Measurement-lite: estimate agent text height (the missing content-sizing step)

## Metadata

| Field | Value |
|---|---|
| ID | DR-151 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | ACCEPTED (live verification pending) |
| Work Item | [WI-236](../work-items/WI-236-agent-text-height-estimate.md) |
| Scope | weave `agent-text-resize.ts` + `use-aku-agent.ts` wiring — weave-only, no engine, no re-vendor |

## Context / problem

weave deliberately removed render-time text auto-height (`TextBlock.tsx` L11-17:
"the measure-and-write-back loop fought the engine and caused the 자동너비/높이/고정
regressions; content-driven sizing is a SEPARATE STEP, fed into the engine as an
input, not measured at render"). But the agent-add path has NO such step — the
agent guesses `frame.height`, and gets it wildly wrong without measurement: live
export (selection 10) showed, on ONE slide, both directions at once —
- CLIP: a 2-line 32px title in a 40px box (need ~80px).
- TOO TALL: "전체 상품 목록" 1-line heading in a **450px** box (need 39px); section
  headers in 40px boxes (need 20px).

No add-path policy tweak fixes this (WI-235 share only helps the no-height
floor-collapse). The only fix is supplying the missing content-sizing step.

## Decision

Implement the **measurement-lite** content-sizing step for agent-added text
(option B), as a one-shot estimate at add time (NOT a render-time observer — so it
does not reintroduce the removed feedback loop):

- New pure helpers in `agent-text-resize.ts`:
  - `estimateTextHeightRatio(text, fontPx, lineHeightMult, parentWPx, parentHPx)` —
    lines = explicit `\n` count + a per-line wrap estimate
    (`ceil(text.length × ~0.6·fontPx / usableWidth)`); `contentPx = lines × fontPx ×
    lineHeight`; returns `contentPx / parentHPx`, capped to a sane band.
  - `containerAbsPx(doc, containerId, canvasW, canvasH)` — walks root→container
    multiplying frame ratios × canvas px to get the container's absolute px box.
- In `fixAgentTextBox` (now given the `design` canvas px), for TEXT added into a
  flex COLUMN, set `frame.height` to the estimate (overriding the agent's
  unreliable guess) and keep `FLEX_COL_TEXT` (basis:"auto" then reads the estimate).
  When canvas px / container px can't be resolved, fall back to current behavior
  (WI-235 share). `use-aku-agent.ts` passes `design` into the call.

## Scope / non-goals (this DR)

- **Flex COLUMN text only** — that is where the visible clip/too-tall live. Flex
  ROW text (width-share) and the GRID table (row-track height, a container-sizing
  problem — the 27-row table's 14px rows) are a SEPARATE follow-up (WI-237).
- Estimate, not exact: explicit `\n` line counts are exact; wrap is approximate
  (CJK vs latin char width). Erring slightly tall (whitespace) is preferred to
  clipping. The exact path (DOM/canvas measure, option A) remains a future upgrade.

## Consequences

- weave-only; takes effect on a **vite reload + regenerate** (no engine/server).
- Risk: a wrong parent-px walk could set a wrong height → guarded (skip when px
  unresolvable; cap the ratio). **Live verification required**: regenerate → the
  console box/need table should read `fits:true` for flex column text (hero title
  no longer clips; section headings no longer 450px).
- Supersedes the practical need for WI-235's share in the common case (height is
  now set), but WI-235 stays as the no-canvas-context fallback.

## Related

- `TextBlock.tsx` L11-17 — the removed auto-height + the intended "separate step".
- WI-235/DR-150 (column share) — the no-height fallback this builds on.
- WI-237 (planned) — grid row-track / table-frame sizing (the 27-row table clip).
