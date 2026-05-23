// WI-016 Phase C — editor hotkey single source of truth.
//
// Centralizes every editor-scope hotkey definition (undo / redo / …) into one
// table that's the canonical source for both the binding (key → action) and
// the tooltip display (id → keys). Replaces the legacy `useHistoryHotkeys`
// raw `window` listener with the project's standard `@agocraft/input/hotkey`
// registry (the same one PresentPage uses).
//
// Why a single source matters — when a tooltip wants to display a shortcut
// (e.g. the Undo button's keycap shows `⌘ + Z`), it should not hard-code the
// string. Hard-coding leads to drift the moment we add platform-specific
// resolution, user remapping, or simply change the binding. Tooltips reference
// hotkeys by `id` (`hotkeyId="undo"`); the provider's `hotkeyTable` (built
// from `EDITOR_HOTKEYS` below) resolves the id to its current display string.

import { createInputBus } from "@agocraft/input/bus";
import { createHotkeyRegistry } from "@agocraft/input/hotkey";
import type { AITooltipHotkeyTable } from "@weave/design-system";
import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@agocraft/editor";

/**
 * One canonical entry per editor binding. The `keys` field is what the user
 * sees on the keycap; the registry accepts a slightly different canonical
 * form (`ControlOrMeta+Z`) for the actual binding — we keep them in sync
 * here so the source of truth is one place.
 */
interface EditorHotkey {
  readonly id: string;
  /** Display string for the keycap (e.g. `⌘ + Z`). */
  readonly keys: string;
  /** Canonical binding string for the hotkey registry. */
  readonly binding: string;
  readonly label: string;
  readonly action: (deps: EditorHotkeyDeps) => void;
}

interface EditorHotkeyDeps {
  readonly editor: Editor;
}

const EDITOR_HOTKEYS: ReadonlyArray<EditorHotkey> = [
  {
    id: "undo",
    keys: "⌘ + Z",
    // `Mod` resolves to ⌘ on macOS and Ctrl elsewhere — the lib's canonical
    // cross-platform binding string. `Cmd` / `Meta` are aliases. Don't write
    // `ControlOrMeta` — it parses as a literal unknown key.
    binding: "Mod+Z",
    label: "되돌리기",
    action: ({ editor }) => {
      if (editor.history.canUndo()) editor.history.undo();
    },
  },
  {
    id: "redo",
    keys: "⌘ + ⇧ + Z",
    binding: "Mod+Shift+Z",
    label: "다시 실행",
    action: ({ editor }) => {
      if (editor.history.canRedo()) editor.history.redo();
    },
  },
];

/**
 * Skip a hotkey when the event originated from a text-editing surface so the
 * browser's native undo / redo behavior on inputs isn't hijacked.
 * Mirrors the guard that lived inside `useHistoryHotkeys` before.
 */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Hook — installs every editor-scope hotkey for the lifetime of the
 * component, returns the lookup table consumers (e.g. `AITooltipProvider`)
 * use to render keycaps. The table reference is stable across renders so
 * passing it to a provider doesn't churn its context value.
 */
export function useEditorHotkeys(editor: Editor): AITooltipHotkeyTable {
  // Capture the latest editor in a ref so registered actions read the live
  // instance even though they were closed over at register time.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bus = createInputBus({ target: window, origin: "editor" });
    const hotkeys = createHotkeyRegistry({ bus, initialScope: "editor" });

    const offs = EDITOR_HOTKEYS.map((hk) =>
      hotkeys.register({
        keys: hk.binding,
        scope: "editor",
        label: hk.label,
        action: (ctx) => {
          // Guard so Cmd+Z while typing in a TextField hits the browser's
          // native undo, not the editor's history. `ctx.event.target` carries
          // the originating element from `@agocraft/input`'s normalized event.
          if (isTextEditingTarget(ctx.event.target)) return;
          hk.action({ editor: editorRef.current });
        },
      }),
    );

    return () => {
      for (const off of offs) off();
      hotkeys.dispose();
      bus.dispose();
    };
  }, []);

  // Build the display table once — references stay stable across renders.
  return useMemo<AITooltipHotkeyTable>(() => {
    const table: Record<string, { keys: string; label: string }> = {};
    for (const hk of EDITOR_HOTKEYS) {
      table[hk.id] = { keys: hk.keys, label: hk.label };
    }
    return table;
  }, []);
}
