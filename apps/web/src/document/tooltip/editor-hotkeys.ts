// WI-026 Phase 2 — Editor commands driven by agocraft's CommandMetadata.
//
// Single source: EDITOR_COMMANDS below. Each entry carries the user-facing
// label/description/hint (i18n-ready), the hotkey display + canonical
// binding, an enabledWhen predicate, and the runtime action. Three downstream
// consumers all read from this one list:
//
//   1. `useEditorHotkeys(editor)` — binds the action under the editor scope
//      via `@agocraft/input/hotkey` and returns the legacy
//      `AITooltipHotkeyTable` so existing tooltips keep working unchanged.
//   2. `editorCommandMetadata` — module-level CommandMetadataRegistry
//      populated at import time. New consumers (CommandButton,
//      CommandKeycap, command palette) resolve labels / shortcuts /
//      enabledWhen from this registry.
//   3. Future `<CommandButton commandId="history.undo" />` — reads
//      everything (label, shortcut, disabled state, click action) from
//      one place.
//
// Adding a new editor command = one new entry below + nothing else.
// CODE_STRUCTURE_DESIGN_RULES Rule 6 (declarative branching via
// context dispatch).

import { createInputBus } from "@agocraft/input/bus";
import { createHotkeyRegistry } from "@agocraft/input/hotkey";
import {
  type CommandMetadata,
  type CommandMetadataRegistry,
  createCommandMetadataRegistry,
} from "@agocraft/core";
import type { AITooltipHotkeyTable } from "@weave/design-system";
import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@agocraft/editor";

interface EditorActionDeps {
  readonly editor: Editor;
}

/** EDITOR_COMMANDS entries combine the user-facing metadata (used by
 *  tooltips / buttons / palette) with the runtime action (used by the
 *  hotkey registry). The metadata is the same shape consumers see via
 *  `editorCommandMetadata.resolve(id)`; the action is stripped before
 *  registration so the metadata registry contains nothing host-specific. */
interface EditorCommand extends CommandMetadata {
  readonly action: (deps: EditorActionDeps) => void;
}

const EDITOR_COMMANDS: ReadonlyArray<EditorCommand> = [
  {
    id: "history.undo",
    label: { en: "Undo", ko: "되돌리기" },
    description: {
      en: "Undo the last action.",
      ko: "마지막 동작을 되돌립니다.",
    },
    hint: {
      en: "Reverts the most recent edit.",
      ko: "가장 최근 편집을 되돌립니다.",
    },
    hotkey: { keys: "⌘ + Z", binding: "Mod+Z", scope: "editor" },
    category: "history",
    enabledWhen: (ctx) => Boolean(ctx.canUndo),
    action: ({ editor }) => {
      if (editor.history.canUndo()) editor.history.undo();
    },
  },
  {
    id: "history.redo",
    label: { en: "Redo", ko: "다시 실행" },
    description: {
      en: "Redo the last undone action.",
      ko: "되돌린 동작을 다시 실행합니다.",
    },
    hint: {
      en: "Replays the most recent undone edit.",
      ko: "가장 최근 되돌린 편집을 다시 적용합니다.",
    },
    hotkey: { keys: "⌘ + ⇧ + Z", binding: "Mod+Shift+Z", scope: "editor" },
    category: "history",
    enabledWhen: (ctx) => Boolean(ctx.canRedo),
    action: ({ editor }) => {
      if (editor.history.canRedo()) editor.history.redo();
    },
  },
];

/** Module-level registry. Populated once at import time so every
 *  consumer (tooltip, button, palette) shares the same metadata
 *  identity. Adding a command above auto-flows into this registry. */
export const editorCommandMetadata: CommandMetadataRegistry =
  createCommandMetadataRegistry();

for (const cmd of EDITOR_COMMANDS) {
  // Strip the `action` field — agocraft's CommandMetadata is purely
  // host-presentational. The action stays in this module and is
  // looked up by id when the hotkey fires.
  const { action: _action, ...meta } = cmd;
  editorCommandMetadata.register(meta);
}

/** Lookup helper for the hotkey-action wiring. */
function findAction(id: string): ((deps: EditorActionDeps) => void) | undefined {
  return EDITOR_COMMANDS.find((cmd) => cmd.id === id)?.action;
}

/** Skip a hotkey when the event originated from a text-editing surface
 *  so the browser's native undo / redo on inputs isn't hijacked. */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

/** Hook — installs every editor-scope hotkey for the lifetime of the
 *  component. Returns the legacy `AITooltipHotkeyTable` (built from the
 *  same metadata registry) so existing tooltip consumers keep working
 *  without changes. Consumers that need the full metadata (label,
 *  enabledWhen, description, palette inclusion) import
 *  `editorCommandMetadata` directly instead. */
export function useEditorHotkeys(editor: Editor): AITooltipHotkeyTable {
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bus = createInputBus({ target: window, origin: "editor" });
    const hotkeys = createHotkeyRegistry({ bus, initialScope: "editor" });

    const offs = EDITOR_COMMANDS.flatMap((cmd) => {
      if (cmd.hotkey === undefined) return [];
      const action = findAction(cmd.id);
      if (action === undefined) return [];
      const koLabel = cmd.label.ko;
      return [
        hotkeys.register({
          keys: cmd.hotkey.binding,
          scope: cmd.hotkey.scope ?? "editor",
          label: koLabel,
          action: (ctx) => {
            if (isTextEditingTarget(ctx.event.target)) return;
            action({ editor: editorRef.current });
          },
        }),
      ];
    });

    return () => {
      for (const off of offs) off();
      hotkeys.dispose();
      bus.dispose();
    };
  }, []);

  // Build the AITooltipHotkeyTable from the same metadata source. New
  // hotkeys added above appear here without a separate registration.
  return useMemo<AITooltipHotkeyTable>(() => {
    const table: Record<string, { keys: string; label: string }> = {};
    for (const meta of editorCommandMetadata.list()) {
      if (meta.hotkey === undefined) continue;
      table[meta.id] = {
        keys: meta.hotkey.keys,
        label: meta.label.ko,
      };
      // Legacy short-id (e.g. "undo") for tooltips that don't yet use
      // the qualified id ("history.undo"). New tooltip lookups should
      // prefer the qualified id.
      const tail = meta.id.split(".").pop();
      if (tail !== undefined && tail !== meta.id) {
        table[tail] = table[meta.id]!;
      }
    }
    return table;
  }, []);
}
