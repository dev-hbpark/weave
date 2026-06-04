# DR-054 — Clipboard hotkeys defer preventDefault so native paste works in text inputs

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-090 (follow-up)
- **Relates:** WI-090/DR-052 (link unit — the URL input that surfaced the bug),
  WI-041 (clipboard copy/cut/paste), `@agocraft/input` hotkey registry (vendored)

## Context / bug

The link URL input (and any future toolbar text field) could not accept paste:
pressing **Cmd+V** with the input focused did nothing. Root cause is the order
inside the vendored `@agocraft/input` hotkey registry's `onBusEvent`:

```
const match = findMatch(ev);
if (match.preventDefault) ev.raw.preventDefault();  // ← fires FIRST (default true)
match.action(ctx);                                  // ← runs AFTER
```

weave registers `weave.clipboard.{copy,cut,paste,pasteSpecial}` (Mod+C/X/V/Opt+V)
through this registry. Each action already early-returns when focus is a text
surface (`isTextEditingTarget(ctx.event.target)`), but the registry has **already
called `preventDefault()`** by then — so the browser's native paste is cancelled
*and* the canvas paste is skipped → nothing happens in the input. This is the
same failure mode the Backspace family already worked around by moving to a
window listener (`WINDOW_LISTENER_COMMAND_IDS` in `editor-hotkeys.ts`).

## Decision

For clipboard commands (`category === "clipboard"`), opt out of the registry's
auto-preventDefault (`preventDefault: false`) and call `preventDefault()` **manually
inside the action, only on the non-text (canvas) path**:

```ts
const isClipboard = cmd.category === "clipboard";
hotkeys.register({
  ...,
  ...(isClipboard ? { preventDefault: false } : {}),
  action: (ctx) => {
    if (isTextEditingTarget(ctx.event.target) || isCroppingNow()) return; // native clipboard
    if (isClipboard) ctx.event.raw.preventDefault();                      // canvas path: suppress default
    action({ editor: editorRef.current });
  },
});
```

`HotkeyBinding.preventDefault?: boolean` is a first-class registry option
(default true), so this is a supported opt-out, not a core patch.

## Consequences

- (+) Native copy / cut / paste work in toolbar text inputs (link URL field, and
  any future input) while the canvas clipboard behaviour is byte-for-byte
  unchanged outside text surfaces.
- (+) Scoped to `category === "clipboard"`; every other hotkey keeps the
  registry's default preventDefault.
- (−) The manual `ctx.event.raw.preventDefault()` duplicates one line the registry
  used to own — acceptable, and localized to the one registration loop.

## Scope note

Only clipboard shortcuts are carved out (the reported bug + the same Cmd-key
family). Undo/redo (Cmd+Z/Y) inside a focused input still route through the
registry; if that surfaces as a problem it gets the same treatment. Verified by
`e2e/link-authoring.spec.ts` ("link URL input accepts native paste") and the
unchanged canvas clipboard suite (`clipboard-items`, `clipboard-paste-special`).
