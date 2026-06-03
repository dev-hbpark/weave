# DR-038 — AKU agent: place text in layout frames, let the layout own fit

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (rule change, no WI)
- **Relates:** DR-016 (text-resize-paradigm — Figma-equivalent text sizing), small-think **DR-020** (frame-layout-owns-fit — the host-agnostic counterpart)

## Context

The AKU agent capability text (`weave-capabilities.ts`) instructed the model to *keep every
text box FIXED — do NOT use auto-height — give it an explicit frame and pin it with
`absolute-constraints`*. This was stated twice: in the `text` itemKind `RESIZE` bullet and in
`WEAVE_DOMAIN_KNOWLEDGE` rule 3. The intent was to stop the agent from relying on the
auto-height ResizeObserver it could not see.

The side effect: the agent hand-placed and pinned text instead of using weave's own
auto-layout machinery (`auto-flex` / `auto-grid` via `weave.frame.setLayout`, child policies
via `weave.item.setLayoutChild`). The result was harder to edit and contradicted weave's own
rule 0 ("NESTED FRAMES ARE THE PRIMARY LAYOUT TOOL").

## Decision

Align the agent's text guidance with **frame-layout-owns-fit** (small-think DR-020):

- A text item is normally a **child of an auto-layout frame** — add it with
  `containerId = a layout frame`; set the frame's `direction / gap / padding / align`
  deliberately and let the frame arrange and space it.
- The box **auto-grows its height** to the wrapped text, which the flex/grid layout absorbs by
  re-flowing its children. The agent does **not** pin a fixed height inside a layout frame.
- Pinning with `absolute-constraints` is now reserved for text placed **directly in an
  absolute-constraints frame** (intentional free-form placement) — not the default.

## Scope (edits)

- `apps/web/src/features/aku/agent/weave-capabilities.ts`
  - `text` itemKind: `RESIZE` bullet → `PLACEMENT & SIZING` (child-of-layout-frame).
  - `WEAVE_DOMAIN_KNOWLEDGE` rule 3: "TEXT BOXES ARE FIXED" → "PLACE TEXT IN LAYOUT FRAMES".

No runtime/editor change — this is agent-prompt guidance only. The host still supports an
explicit fixed/pinned text box for the free-form case; only the *default the agent reaches
for* changed.

## Consequences

- Agent-generated decks use nested auto-layout frames; text re-flows when frames move/resize.
- Consistent with rule 0 and with small-think DR-020 — host and host-agnostic guidance now
  agree (previously they contradicted).
- The factual code comment in `weave-command-schemas.ts` ("the box is AUTO-HEIGHT, height
  auto-fits") remains accurate and is now leaned into rather than disabled.
