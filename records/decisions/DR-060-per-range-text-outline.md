# DR-060 — Per-range text outline via Lexical node style

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-029 (Phase 2 follow-up)
- **Relates:** DR-059 (whole-item layered outline — this is the v2 it deferred),
  DR-057 (`textRuns` single source of truth, `renderReadOnly`), DR-015 (Lexical),
  C1 (snapshot-signature commit guard)

## Context

DR-059 shipped whole-item outline and deferred per-range ("부분 레인지") because
the Lexical editor has no native outline command. The constraint that forces the
design: **while a text item is being edited, the Lexical editor is the
authoritative source of `textRuns`** — every `onChange` overwrites the model via
`readSnapshot`. So writing per-range outline directly to the model (the way the
whole-item toolbar does) would be clobbered by the editor's next keystroke. And a
sub-range can only be selected *inside* the editor. Therefore per-range outline
must be authored **through the editor's own state**.

Lexical supports exactly this: `TextNode.getStyle()/setStyle()` (a CSS string
that serializes), and `@lexical/selection`'s `$patchStyleText(selection, patch)`
applies inline CSS to the selected text (splitting nodes at boundaries) — the
same mechanism Lexical color/font-size pickers use. Both are already direct
dependencies (`@lexical/selection@^0.44`).

## Decision

Author per-range outline as a `-webkit-text-stroke-*` style on the selected
TextNodes; extract it in `readSnapshot`; render it per-run in the read-only
layered outline.

### Model — weave-local per-run extension (no vendored change)

`TextRun.attributes` is typed `PartialTextStyle` (agocraft) which has no outline.
Add a weave-local widening (mirrors how whole-item `textOutline` and `textRuns`
were added weave-locally; survives `onUnknown: "preserve"`):

```ts
// types.ts
export type WeaveRunStyle = PartialTextStyle & {
  readonly outlineColor?: string;
  readonly outlineWidth?: number; // VISIBLE halo px (design-space)
};
```

Read/write run outline through a `WeaveRunStyle` cast; no `@agocraft/core` change.

### Authoring (LexicalTextEditor)

- A bridge module `active-text-outline.ts` (module singleton, the
  `cropping-state` / `history-replay-state` pattern) holds the currently-editing
  item's outline applier `{ itemId, setColor, setWidth, clear }`.
- An `OutlineBridgePlugin` inside the editor registers the applier on mount
  (unregisters on unmount). Each method runs `editor.update(() =>
  $patchStyleText($getSelection(), { '-webkit-text-stroke-color': …,
  '-webkit-text-stroke-width': `${w}px`, 'paint-order': 'stroke' }))`. `setColor`/
  `setWidth` read the selection's current counterpart via
  `$getSelectionStyleValueForProperty` so a partial edit preserves the other
  half; `clear` patches the three props to `null`.
- `readSnapshot` reads `node.getStyle()`, parses `-webkit-text-stroke-color` and
  `-webkit-text-stroke-width` → `outlineColor` / `outlineWidth` on the run.
- The seed re-applies stored run outline via `textNode.setStyle(...)` so edit
  re-entry round-trips.

Storing real `-webkit-text-stroke-*` (not a custom prop) gives a rough **live
preview** inside the editor (single-layer, centered) while editing; the polished
layered look appears in read-only.

### Render (TextBlock)

- The DR-059 back layer goes per-run. In `renderReadOnly` "outline" mode, a run
  carrying `outlineWidth > 0` sets its OWN `-webkit-text-stroke:
  ${2×width}px outlineColor` (the 2× = visible-halo convention from DR-059) on
  its span. A run without per-run outline inherits the container's whole-item
  outline if one is set, else renders transparent (no halo).
- The back layer is now shown when the item has a whole-item outline **OR** any
  run carries outline. Front fill unchanged.

### Toolbar (text-section)

The existing 외곽선 control routes by context, read at click time:

- **While editing** (an applier is registered for the selected item) → apply to
  the editor SELECTION via the bridge (per-range).
- **Not editing** → whole-item `textOutline` (DR-059 behavior).

## Consequences

- (+) Per-range outline with no vendored agocraft change; reuses the DR-059
  render and the existing toolbar control.
- (+) Author-through-editor avoids the model-clobber race; round-trips via node
  style; undoable through the normal `weave.item.update` commit on `onChange`.
- (−) The toolbar control's DISPLAYED value still reflects the whole-item outline,
  not the live selection (reading selection style reactively into the toolbar is
  deferred). Applying still routes per-range correctly. v1 limitation.
- (−) In-editor preview is the single-layer (centered) approximation; the clean
  layered halo is read-only only — same policy as rich-run rendering.
- (−) `-webkit-text-stroke` line-join is browser-fixed (round). Acceptable.

## Verification

- Headless-Lexical unit: a TextNode with a `-webkit-text-stroke-*` style →
  `readSnapshot` yields a run with `outlineColor`/`outlineWidth`; round-trips
  through the seed.
- `TextBlock.test.tsx`: a run with `outlineWidth` renders its own
  `-webkit-text-stroke` in the back layer; a run without it stays transparent
  (no whole-item outline) — and inherits when a whole-item outline is set.
- e2e: select a sub-range in the editor, apply outline via the toolbar, exit;
  the model's `textRuns` shows outline only on the in-range run and the read-only
  render carries the per-run stroke.
