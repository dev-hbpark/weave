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
  /** Host-supplied opener for the command palette. Wired from DesignPage
   *  via `setPaletteOpener` so the hotkey can toggle the palette without
   *  this module owning React state. */
  readonly openPalette?: () => void;
}

/** Host-side hook into a quick-action command. The action itself is a
 *  closure over the hovered item the host knows about; this slot is
 *  populated by DesignPage at mount and cleared on unmount. */
let frameDuplicator: ((frameId: string) => void) | undefined;
let frameDeleter: ((frameId: string) => void) | undefined;
let mediaSrcOpener: ((kind: "image" | "video", frameId: string) => void) | undefined;
/** WI-035 P2 — hover-scope "add child frame" action. Distinct from the
 *  selection-scope `setItemAdder` (hotkey path) because QuickActionBar
 *  dispatches with the hovered frame id, not the selected one. */
let hoverFrameChildAdder: ((parentFrameId: string) => void) | undefined;
export function setHoverFrameChildAdder(
  fn: (parentFrameId: string) => void,
): () => void {
  hoverFrameChildAdder = fn;
  return () => {
    if (hoverFrameChildAdder === fn) hoverFrameChildAdder = undefined;
  };
}

export function setFrameDuplicator(fn: (frameId: string) => void): () => void {
  frameDuplicator = fn;
  return () => {
    if (frameDuplicator === fn) frameDuplicator = undefined;
  };
}
export function setFrameDeleter(fn: (frameId: string) => void): () => void {
  frameDeleter = fn;
  return () => {
    if (frameDeleter === fn) frameDeleter = undefined;
  };
}
export function setMediaSrcOpener(
  fn: (kind: "image" | "video", frameId: string) => void,
): () => void {
  mediaSrcOpener = fn;
  return () => {
    if (mediaSrcOpener === fn) mediaSrcOpener = undefined;
  };
}

let paletteOpener: (() => void) | undefined;

/** Host registration — DesignPage calls this so the `palette.open`
 *  hotkey can fire the palette without this module owning the React
 *  state. Returns a disposer that clears the binding. */
export function setPaletteOpener(opener: () => void): () => void {
  paletteOpener = opener;
  return () => {
    if (paletteOpener === opener) paletteOpener = undefined;
  };
}

/** WI-033 A3 — keyboard selection navigation. The host (DesignPage)
 *  registers a single navigator that owns the selection-context wiring
 *  (current selection + doc + selectFrame setter). The four hotkey
 *  actions (selection.drillDown / drillUp / nextSibling / prevSibling)
 *  dispatch through this slot — keeps this module pure and lets the
 *  navigator close over React state without exporting it. */
export type SelectionNavDir =
  | "drillDown"
  | "drillUp"
  | "nextSibling"
  | "prevSibling";
let selectionNavigator: ((dir: SelectionNavDir) => void) | undefined;
export function setSelectionNavigator(
  fn: (dir: SelectionNavDir) => void,
): () => void {
  selectionNavigator = fn;
  return () => {
    if (selectionNavigator === fn) selectionNavigator = undefined;
  };
}

/** WI-035 P1 — tool hotkey (R/T/L/F) host slot. The host registers a
 *  single adder that knows the current selection / design size and
 *  produces a default-sized item of the requested kind. Hotkey actions
 *  dispatch through this slot so the editor-hotkeys module stays
 *  React-agnostic. */
export type ItemAdderKind =
  | "addRect"
  | "addText"
  | "addLine"
  | "addFrame";
let itemAdder: ((kind: ItemAdderKind) => void) | undefined;
export function setItemAdder(
  fn: (kind: ItemAdderKind) => void,
): () => void {
  itemAdder = fn;
  return () => {
    if (itemAdder === fn) itemAdder = undefined;
  };
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
  {
    id: "palette.open",
    label: { en: "Command palette", ko: "명령 팔레트" },
    description: {
      en: "Open the command palette to search and run any command.",
      ko: "명령 팔레트를 열어 모든 명령을 검색하고 실행합니다.",
    },
    hotkey: { keys: "⌘ + K", binding: "Mod+K", scope: "editor" },
    category: "view",
    action: () => {
      paletteOpener?.();
    },
  },
  // ── Selection navigation (WI-033 A3) ──────────────────────────────────
  // Figma's keyboard model: Enter drills into the selection, Shift+Enter
  // walks back up, Tab/Shift+Tab cycle siblings (with wrap-around). The
  // hotkey registry already skips bindings when the event target is a
  // text-editing surface (see `isTextEditingTarget`), so Lexical /
  // contenteditable / input / textarea retain native key handling.
  {
    id: "selection.drillDown",
    label: { en: "Select first child", ko: "자식 선택" },
    description: {
      en: "Move the selection to the first child of the currently selected frame.",
      ko: "현재 선택된 프레임의 첫 번째 자식으로 선택을 이동합니다.",
    },
    hotkey: { keys: "↵", binding: "Enter", scope: "editor" },
    category: "selection",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      selectionNavigator?.("drillDown");
    },
  },
  {
    id: "selection.drillUp",
    label: { en: "Select parent", ko: "부모 선택" },
    description: {
      en: "Move the selection one level up to the parent frame.",
      ko: "선택을 한 단계 위 부모 프레임으로 이동합니다.",
    },
    hotkey: { keys: "⇧ + ↵", binding: "Shift+Enter", scope: "editor" },
    category: "selection",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      selectionNavigator?.("drillUp");
    },
  },
  {
    id: "selection.nextSibling",
    label: { en: "Select next sibling", ko: "다음 형제 선택" },
    description: {
      en: "Move the selection to the next sibling within the same parent (wraps around).",
      ko: "같은 부모 안의 다음 형제 프레임으로 선택을 이동합니다 (순환).",
    },
    hotkey: { keys: "⇥", binding: "Tab", scope: "editor" },
    category: "selection",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      selectionNavigator?.("nextSibling");
    },
  },
  {
    id: "selection.prevSibling",
    label: { en: "Select previous sibling", ko: "이전 형제 선택" },
    description: {
      en: "Move the selection to the previous sibling within the same parent (wraps around).",
      ko: "같은 부모 안의 이전 형제 프레임으로 선택을 이동합니다 (순환).",
    },
    hotkey: { keys: "⇧ + ⇥", binding: "Shift+Tab", scope: "editor" },
    category: "selection",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      selectionNavigator?.("prevSibling");
    },
  },
  // ── Tool hotkey (WI-035 P1) ───────────────────────────────────────────
  // Figma parity: single press inserts a default-sized item of the
  // requested kind into the current selected frame's center (or root if
  // nothing is selected). The hotkey registry already skips text-edit
  // surfaces, and `enabledWhen` adds the explicit `isTextEditing`
  // guard so the four shortcuts never fire while the user is typing.
  {
    id: "tool.addRect",
    label: { en: "Add rectangle", ko: "직사각형 추가" },
    description: {
      en: "Insert a default-sized rectangle into the current frame.",
      ko: "현재 프레임에 기본 크기 직사각형을 추가합니다.",
    },
    hotkey: { keys: "R", binding: "R", scope: "editor" },
    category: "tool",
    enabledWhen: (ctx) => !ctx.isTextEditing,
    action: () => {
      itemAdder?.("addRect");
    },
  },
  {
    id: "tool.addText",
    label: { en: "Add text", ko: "텍스트 추가" },
    description: {
      en: "Insert a default text item into the current frame.",
      ko: "현재 프레임에 기본 텍스트를 추가합니다.",
    },
    hotkey: { keys: "T", binding: "T", scope: "editor" },
    category: "tool",
    enabledWhen: (ctx) => !ctx.isTextEditing,
    action: () => {
      itemAdder?.("addText");
    },
  },
  {
    // WI-035 bug fix — `L` collided with an existing layer-move
    // affordance in the user's session. The Line tool stays in the
    // command registry (palette + Toolbar add menu can dispatch it)
    // but loses its single-key shortcut. A non-conflicting binding
    // will be assigned in a follow-up after the conflict source is
    // identified.
    id: "tool.addLine",
    label: { en: "Add line", ko: "선 추가" },
    description: {
      en: "Insert a default line into the current frame.",
      ko: "현재 프레임에 기본 선을 추가합니다.",
    },
    category: "tool",
    enabledWhen: (ctx) => !ctx.isTextEditing,
    action: () => {
      itemAdder?.("addLine");
    },
  },
  {
    id: "tool.addFrame",
    label: { en: "Add frame", ko: "프레임 추가" },
    description: {
      en: "Insert a default-sized frame into the current frame.",
      ko: "현재 프레임에 기본 크기 프레임을 추가합니다.",
    },
    hotkey: { keys: "F", binding: "F", scope: "editor" },
    category: "tool",
    enabledWhen: (ctx) => !ctx.isTextEditing,
    action: () => {
      itemAdder?.("addFrame");
    },
  },
  // ── Hover-visible commands (WI-027) ────────────────────────────────────
  // These commands have `visibleWhen` so they appear in the hovered
  // frame's QuickActionBar. They do NOT have a global hotkey — the bar
  // is the discovery surface. Adding a new command here = new affordance.
  {
    id: "frame.duplicate",
    label: { en: "Duplicate", ko: "복제" },
    hint: { en: "Copy this frame.", ko: "이 프레임을 복제합니다." },
    category: "frame",
    visibleWhen: (ctx) =>
      ctx.hoveredKind === "frame"
      || ctx.hoveredKind === "image"
      || ctx.hoveredKind === "video"
      || ctx.hoveredKind === "shape"
      || ctx.hoveredKind === "text",
    enabledWhen: (ctx) => typeof ctx.hoveredId === "string",
    action: () => {
      // No-op at module level — dispatched via the frameDuplicator slot
      // since the closure captures useDesign's addItem.
    },
  },
  // WI-035 P2 — "+" QuickActionBar button on hovered frames. Click
  // inserts a default-sized child frame; the closure (DesignPage) owns
  // the actual `weave.item.add` exec via the `hoverFrameChildAdder`
  // host slot. visibleWhen restricts to `frame` kind only (primitives
  // can't host children).
  {
    id: "frame.addChild",
    label: { en: "Add child frame", ko: "자식 프레임 추가" },
    hint: { en: "Insert a default-sized frame here.", ko: "이 프레임 안에 새 프레임을 추가합니다." },
    category: "frame",
    visibleWhen: (ctx) => ctx.hoveredKind === "frame",
    enabledWhen: (ctx) => typeof ctx.hoveredId === "string",
    action: () => {
      // Dispatched via hoverFrameChildAdder slot.
    },
  },
  {
    id: "frame.delete",
    label: { en: "Delete", ko: "삭제" },
    hint: { en: "Remove this frame.", ko: "이 프레임을 삭제합니다." },
    category: "frame",
    visibleWhen: (ctx) =>
      ctx.hoveredKind === "frame"
      || ctx.hoveredKind === "image"
      || ctx.hoveredKind === "video"
      || ctx.hoveredKind === "shape"
      || ctx.hoveredKind === "text",
    enabledWhen: (ctx) => typeof ctx.hoveredId === "string",
    action: () => {
      // Dispatched via frameDeleter slot.
    },
  },
  {
    id: "image.replaceSrc",
    label: { en: "Replace image", ko: "이미지 교체" },
    hint: { en: "Open the media picker.", ko: "이미지 소스를 변경합니다." },
    category: "image",
    visibleWhen: (ctx) => ctx.hoveredKind === "image",
    enabledWhen: (ctx) => typeof ctx.hoveredId === "string",
    action: () => {
      // Dispatched via mediaSrcOpener slot.
    },
  },
  {
    id: "video.replaceSrc",
    label: { en: "Replace video", ko: "비디오 교체" },
    hint: { en: "Open the media picker.", ko: "비디오 소스를 변경합니다." },
    category: "video",
    visibleWhen: (ctx) => ctx.hoveredKind === "video",
    enabledWhen: (ctx) => typeof ctx.hoveredId === "string",
    action: () => {
      // Dispatched via mediaSrcOpener slot.
    },
  },
];

/** Bridge between dispatchEditorCommand and host-supplied action slots.
 *  Called from dispatchEditorCommand for command ids whose static
 *  `action` is a no-op (the host owns the closure). */
function tryHostSlot(
  id: string,
  ctx: Readonly<Record<string, unknown>> | undefined,
): boolean {
  const hoveredId =
    typeof ctx?.hoveredId === "string" ? ctx.hoveredId : undefined;
  const hoveredKind =
    typeof ctx?.hoveredKind === "string" ? ctx.hoveredKind : undefined;
  if (id === "frame.duplicate" && frameDuplicator !== undefined && hoveredId !== undefined) {
    frameDuplicator(hoveredId);
    return true;
  }
  if (id === "frame.delete" && frameDeleter !== undefined && hoveredId !== undefined) {
    frameDeleter(hoveredId);
    return true;
  }
  if (
    id === "frame.addChild"
    && hoverFrameChildAdder !== undefined
    && hoveredId !== undefined
  ) {
    hoverFrameChildAdder(hoveredId);
    return true;
  }
  if (
    id === "image.replaceSrc"
    && mediaSrcOpener !== undefined
    && hoveredId !== undefined
    && hoveredKind === "image"
  ) {
    mediaSrcOpener("image", hoveredId);
    return true;
  }
  if (
    id === "video.replaceSrc"
    && mediaSrcOpener !== undefined
    && hoveredId !== undefined
    && hoveredKind === "video"
  ) {
    mediaSrcOpener("video", hoveredId);
    return true;
  }
  return false;
}

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

/** Dispatch an editor command by id. Used by CommandHostProvider's
 *  `dispatch` so UI buttons / palette entries share the same action
 *  source as the hotkey registry. No-op on unknown id (failure is
 *  surfaced via `metadata.isEnabled` and the button's `disabled` state).
 *
 *  Falls back to a registered host slot (`setFrameDuplicator` /
 *  `setFrameDeleter` / `setMediaSrcOpener`) when the command's static
 *  action is a no-op — used for hover-context commands whose action
 *  closure lives in DesignPage. */
export function dispatchEditorCommand(
  id: string,
  deps: EditorActionDeps,
  hoverCtx?: Readonly<Record<string, unknown>>,
): void {
  if (tryHostSlot(id, hoverCtx)) return;
  findAction(id)?.(deps);
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
            if (import.meta.env.DEV) {
              // WI-035 diagnostic — confirm the hotkey path fires in
              // real browsers. Remove once R/T/F bug is verified
              // closed in user testing.
              // eslint-disable-next-line no-console
              console.debug("[editor-hotkey]", cmd.id, "fired");
            }
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
