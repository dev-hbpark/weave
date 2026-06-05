# DR-057 — `textRuns` is the single source of truth for inline text formatting

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-029 (Phase 2 follow-up)
- **Relates:** DR-015 (Lexical), DR-056 (text undo), C1 fix (range-format commit),
  `text-section.tsx` (item-level toolbar toggles), `TextBlock.renderReadOnly`,
  `LexicalTextEditor` seed + `readSnapshot`

## Context / bug

Inline text formatting (bold / italic / underline) had **two disconnected
representations** that did not compose:

1. **Item-level attrs** — `attrs.fontWeight` / `fontStyle` / `textDecoration`,
   written by the toolbar quick toggles (`text-section.tsx:202-248`). These
   apply to the **whole** text box.
2. **Per-run `textRuns[].attributes`** — written by the Lexical editor's
   Cmd+B/I/U over a **sub-range**.

Concrete failures observed:

- **Seed amnesia.** Edit entry seeds the Lexical editor **only** from
  `attrs.textRuns` (`TextBlock.tsx:391`), ignoring item-level attrs. A box made
  bold via the toolbar opened in the editor as **non-bold**; the visible bold
  was only the container `font-weight` bleeding through by CSS inheritance.
- **Can't un-bold a sub-range.** `renderReadOnly` only emits `font-weight:bold`
  when a run *is* bold; `formatToAttributes` returns `undefined` for non-bold
  (`LexicalTextEditor.tsx:72`). With an item-level-bold container, a "normal"
  run has no way to override the inherited bold — there is no explicit-normal.
- **No WYSIWYG while editing.** `TextBlock` mounts `LexicalTextEditor` **without**
  `contentStyle` (`TextBlock.tsx:388-393`) though the prop exists, so the editor
  renders in browser-default font/size/color, not the item's resolved style —
  a visible jump on enter/exit edit.
- **Toolbar vs editor disagree.** Toolbar toggles never touched `textRuns`, and
  the editor never touched item-level attrs, so the two drift out of sync.

## Decision

Establish one model:

> **Item-level typographic attrs are the BLOCK BASE. `textRuns[].attributes` are
> per-range OVERRIDES layered on the base. When `textRuns` is present it is the
> authoritative description of inline formatting for the box.**

Rules:

1. **Base vs override.** `fontFamily`, `fontSize`, `color`, `letterSpacing`,
   `textCase`, alignment, line-height are the base for every run; a run inherits
   them unless it carries an override. The **inline toggleables** (`fontWeight`,
   `fontStyle`, `textDecoration`) are driven by runs when `textRuns` exists.
2. **Neutralize the container's inline toggleables when runs exist.** The
   read-only inner container sets `font-weight/style` `normal` and
   `text-decoration` `none` when `textRuns` is present, so the per-run `<span>`s
   are the sole authority (a run with no bold attr renders normal — the explicit
   un-bold that was previously impossible). With **no** runs (plain / legacy),
   the container keeps applying item-level attrs unchanged → backward compatible.
3. **Seed parity on edit entry.** The Lexical seed projects the item-level
   inline toggleables into every seed node's format when entering edit, so a
   toolbar-bolded box opens already bold and Cmd+B toggles per-range correctly.
   The first edit therefore captures the box's current look into `textRuns`
   instead of dropping it.
4. **WYSIWYG.** `TextBlock` passes the resolved base (`fontFamily`, `fontSize`px,
   `color`, `letterSpacing`, `textAlign`, `lineHeight`) to the editor via
   `contentStyle`. Inline toggleables come from the seeded node formats + Lexical
   theme classes, not `contentStyle`.
5. **Toolbar writes through the model.** The Bold / Italic / Underline quick
   toggles rewrite **every run** when the item has `textRuns` (and still set the
   item-level attr for the no-runs / legacy path). This keeps the toolbar and the
   editor reading/writing one source of truth.

## Consequences

- (+) Item-level and per-range formatting compose: toolbar bold over a box,
  editor un-bold over a word, both survive a round-trip and an edit-entry.
- (+) Editing is WYSIWYG — the caret text matches the rendered text.
- (+) Backward compatible: text with no `textRuns` renders exactly as before;
  the run-driven path activates only once runs exist (which is after any edit).
- (−) **Toolbar quick-toggle pressed-state reflects the item-level base, not the
  per-run reality.** A box with mixed runs (some bold, some not) shows the
  toolbar Bold as the last-applied base value, not "Mixed". Detecting per-run
  mixed in the toolbar is deferred (would require reading `textRuns` in
  `text-section`). Documented limitation, not a correctness bug.
- (−) The run-rewrite in the toolbar toggles iterates all runs on each whole-box
  toggle — O(runs), negligible for realistic text lengths.

## Verification

- Headless-Lexical unit (`LexicalTextEditor.test.ts`): seed-with-base →
  `readSnapshot` round-trip preserves item-level bold as a bold run; un-bolding a
  seeded-bold node yields a non-bold run.
- `TextBlock` render test (`renderToStaticMarkup`): with `textRuns` + item-level
  bold, a run with no bold attr renders `font-weight:normal` (override works);
  with no `textRuns`, the container still applies item-level bold (legacy path).
