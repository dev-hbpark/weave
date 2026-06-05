# DR-062 — Per-range typography: generalize the editor style bridge

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-093
- **Relates / extends:** DR-060 (per-range outline — the outline-only v1 this
  generalizes), DR-059 (layered outline render), DR-057 (`textRuns` single
  source of truth, `renderReadOnly`), DR-015 (Lexical), DR-design-013 (capture-
  phase outside-pointer dismiss backstop)
- **Supersedes:** the two v1 limitations DR-060 § Consequences deferred
  (displayed value reflects whole-item not selection; apply routes only outline).
  DR-060 stays **Accepted** — its outline mechanism is unchanged and subsumed.

## Context

DR-060 shipped per-range **outline** by authoring `-webkit-text-stroke-*` onto
the selected Lexical `TextNode`s through a module-singleton bridge
(`active-text-outline.ts` + `OutlineBridgePlugin`), reading it back in
`readSnapshot`, and re-seeding it on edit re-entry. Three gaps surfaced in use
(operator bug report, 2026-06-05):

1. **Only outline applies per-range.** Every other text control (color, size,
   family, 꾸밈/decoration, 대소문자/case, 자간/letter-spacing) routes through
   `updateAll → weave.item.update` (whole-item attrs). While a sub-range is
   selected in the editor, those controls paint the WHOLE box (or appear inert
   because `hasRuns` makes per-run spans override the item base). The toolbar
   B/I/U buttons rewrite **every** run via `setRunsInlineAttr`. Only `Cmd+B/I/U`
   (Lexical-native) actually respects the range. → "부분 속성 적용이 안 되는 게 많다".

2. **The outline slider closes the More popover.** `Bar.More` is a Radix
   `Popover`. Whole-item apply goes through the model command (no focus change)
   → popover stays. Per-range apply goes through `editor.update($patchStyleText)`
   → Lexical reconciles the selection and returns DOM focus to the
   contentEditable → focus leaves the popover content → Radix `Popover`
   `onFocusOutside` / `onInteractOutside` dismisses it. The mousedown that starts
   the slider drag also blurs the editor, collapsing the DOM selection, so the
   patch can no-op. → "마우스 다운하는 순간 메뉴가 사라진다".

3. **Displayed color ignores the selection.** The toolbar reads
   `useResolveSharedColor(items, …)` — the item-level attr — never the live
   run colors in the selection. A multi-color selection cannot show "여러 색",
   and a single-color sub-range cannot show its one color. DR-060 explicitly
   deferred this. → "전체일 때 다중색, 부분 단색이면 한 색" 미구현.

`PartialTextStyle` (agocraft) already types every per-run property we need
(`fontFamily / fontSize / fontWeight / fontStyle / color / textDecoration /
textCase / letterSpacing`), and `renderReadOnly` (DR-057) **already renders**
all of them per run. The missing surface is entirely on the AUTHORING +
READ-BACK + DISPLAY side, plus the popover-focus interaction.

## Decision

Generalize the outline-only bridge into a single **per-range text-style bridge**
that (a) writes arbitrary inline style / format to the live selection,
(b) preserves the selection across the toolbar's focus theft, and (c) exposes a
**read** of the selection's current value per property — with Lexical's built-in
"mixed → empty string" semantics driving the multi/single color display.

### 1. Property registry (no `switch` on property — Rule 6)

A single `RANGE_STYLE_PROPS` table, one descriptor per styleable property, is the
sole branch point. Each descriptor declares how the property maps between a
`WeaveRunStyle` attribute and a Lexical inline **CSS declaration**:

```ts
interface RangeStyleProp<T> {
  readonly attrKey: keyof WeaveRunStyle;       // run attribute key
  readonly cssProp: string;                    // node-style CSS property
  toCss(value: T): string | null;              // attr value → CSS (null = clear)
  fromCss(css: string): T | undefined;         // CSS → attr value (read-back)
}
```

`color / fontSize(px) / fontFamily / letterSpacing(px) / textCase(text-transform)`
are CSS-declaration props applied via `@lexical/selection`'s `$patchStyleText`.
`fontWeight(bold) / fontStyle(italic) / textDecoration(underline|strikethrough)`
stay **format-bitmask** props applied via Lexical's `FORMAT_TEXT_COMMAND` (their
existing native path). `outlineColor + outlineWidth` keep the DR-060 paired
`-webkit-text-stroke-*` writer. The bridge, `nodeToAttributes`, and the seed all
iterate the registry; adding a property is one table row, never a new `if`.

### 2. Bridge — `active-text-style.ts` (supersedes `active-text-outline.ts`)

Module singleton (same `cropping-state` pattern). Interface widens from the
3-method outline applier to:

```ts
interface ActiveTextStyle {
  readonly itemId: string;
  setStyleProp(attrKey, value): void;   // CSS-declaration props
  toggleFormat(format): void;           // bold | italic | underline | strikethrough
  setOutline(color, width): void;       // DR-060 paired writer
  clearOutline(): void;
  read(): SelectionStyleReadout;        // current value + `mixed` per property
}
```

**Selection preservation.** A `TextStylePlugin` inside the editor registers a
`SELECTION_CHANGE_COMMAND` listener that saves the last **non-collapsed**
`RangeSelection` (cloned). Every applier method runs inside `editor.update`,
and if the live selection is collapsed/null (the toolbar mousedown blurred the
editor), it restores the saved range via `$setSelection(saved.clone())` before
`$patchStyleText` / `FORMAT_TEXT_COMMAND`. This fixes the no-op-on-blur half of
gap #2 and makes every property apply to the intended range regardless of focus.

**Read.** `read()` runs inside `editor.getEditorState().read()` over the saved-
or-live range and, per registry prop, calls
`$getSelectionStyleValueForProperty(sel, cssProp, "")`. Lexical returns the
**common value, or `""` when the range spans differing values** — `""` is the
canonical "mixed" signal (gap #3). Format props read via
`selection.hasFormat(...)`. The bridge emits a change on selection change so the
toolbar re-renders with the live readout.

### 3. Read-back + seed (round-trip)

`nodeToAttributes(format, style)` parses the full registry from the node style
string (color, font-size→number, font-family, letter-spacing→number,
text-transform→textCase) in addition to the existing format bits + outline. The
`editorState` seed re-applies every run attribute as the node's inline style
(via the same `toCss`), so edit re-entry round-trips all per-range typography,
not just outline. `renderReadOnly` is unchanged — it already paints these.

### 4. Toolbar routing + display (text-section)

When an `ActiveTextStyle` is registered for the single selected item (= editing),
each control routes to the bridge instead of `updateAll`; otherwise whole-item
(unchanged). The displayed value, **while editing**, comes from the bridge
`read()` (mixed → the Mixed/다중 badge and a neutral swatch), not from
`useResolveSharedColor(items)`. Not editing → item attrs as today.

### 5. Popover focus exemption (gap #2, dismissal half)

The active editor surface is marked `data-dismiss-exempt="true"`. The design-
system `Popover` already exempts that marker in its capture-phase backstop
(DR-design-013); we extend the SAME exemption to Radix's own
`onInteractOutside` (covers `onPointerDownOutside` + `onFocusOutside`): when the
interaction's target lies within a `data-dismiss-exempt` element, the handler
calls `event.preventDefault()`. This is a generic design-system behavior (any
consumer can opt an element out of dismissal), consistent with DR-design-013 —
not a text-specific hack in a shared component. Result: focus bouncing to the
editor no longer closes the More popover; clicking the bare canvas still does.

## Consequences

- (+) All five requested properties (color, size, family, 꾸밈, 자간) + case +
  the existing B/I/U + outline apply **per-range**, round-trip through
  `textRuns`, and remain undoable via the normal `onChange → weave.item.update`.
- (+) Multi-color / single-color display falls out of Lexical's
  `$getSelectionStyleValueForProperty` "" semantics — no bespoke aggregation.
- (+) Selection survives the toolbar's focus theft → no more no-op applies; the
  More popover stays open during a slider drag.
- (+) Rule-6 registry: one table, zero `switch (prop)`; new per-range props are
  one row.
- (−) Per-range **font size** is px-only; the px↔% (`fontSizeSpec ratio`) unit
  toggle stays whole-item (ratio needs the parent-height denominator, undefined
  per-character). Acceptable — % sizing is a box-level layout concern.
- (−) In-editor preview remains the single-layer outline approximation (DR-060);
  the layered halo is read-only only.
- (−) `data-dismiss-exempt` widened to Radix interact-outside affects every
  `Popover`. Mitigated: behavior only triggers for explicitly-marked elements;
  default (unmarked) dismissal is unchanged, covered by a design-system unit.

## Verification (SVL gate)

- **Unit (headless Lexical):** a TextNode styled `color/font-size/font-family/
  letter-spacing/text-transform` → `readSnapshot` yields the matching run attrs;
  round-trips through the seed. Registry `toCss/fromCss` are inverse per prop.
- **Unit (design-system):** `Popover` does not dismiss when the outside pointer/
  focus target is inside a `data-dismiss-exempt` element; still dismisses
  otherwise.
- **e2e (REAL UI path — the DR-060 gap):** enter edit, select a sub-range, open
  더보기, (a) pick a color in the ColorPicker and drag the 외곽선 두께 slider →
  the popover **stays open** and only the in-range run changes; (b) select a span
  covering two differently-colored runs → the swatch shows the mixed/다중 state;
  select a single-color sub-range → the swatch shows that one color. The prior
  DR-060 spec that drove `__weaveActiveTextOutline` directly is migrated to this
  real-UI spec (Decommission Sweep) rather than left as a bridge-only test.
