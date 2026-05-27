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

import {
  type CommandMetadata,
  type CommandMetadataRegistry,
  createCommandMetadataRegistry,
} from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { createInputBus } from "@agocraft/input/bus";
import { createHotkeyRegistry } from "@agocraft/input/hotkey";
import type { AITooltipHotkeyTable } from "@weave/design-system";
import { useEffect, useMemo, useRef } from "react";

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
export function setHoverFrameChildAdder(fn: (parentFrameId: string) => void): () => void {
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

/** WI-036 follow-up — multi-selection bulk action slot. The host
 *  registers a single callback that consumes every currently-selected
 *  item id. Today the only `multi.*` command is `multi.delete`. */
let multiDeleter: (() => void) | undefined;
export function setMultiDeleter(fn: () => void): () => void {
  multiDeleter = fn;
  return () => {
    if (multiDeleter === fn) multiDeleter = undefined;
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
export type SelectionNavDir = "drillDown" | "drillUp" | "nextSibling" | "prevSibling";
let selectionNavigator: ((dir: SelectionNavDir) => void) | undefined;
export function setSelectionNavigator(fn: (dir: SelectionNavDir) => void): () => void {
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
export type ItemAdderKind = "addRect" | "addText" | "addLine" | "addFrame";
let itemAdder: ((kind: ItemAdderKind) => void) | undefined;
export function setItemAdder(fn: (kind: ItemAdderKind) => void): () => void {
  itemAdder = fn;
  return () => {
    if (itemAdder === fn) itemAdder = undefined;
  };
}

/** WI-038 — z-order dispatch host slot. The hotkey / ContextMenu surface
 *  fires one of four directions; the host (DesignPage) registers a closure
 *  that resolves the currently-selected item id and routes to the matching
 *  `weave.item.*` command. Keeps editor-hotkeys React-agnostic. */
export type ZOrderDir = "bringToFront" | "bringForward" | "sendBackward" | "sendToBack";
let zorderDispatcher: ((dir: ZOrderDir) => void) | undefined;
export function setZOrderDispatcher(fn: (dir: ZOrderDir) => void): () => void {
  zorderDispatcher = fn;
  return () => {
    if (zorderDispatcher === fn) zorderDispatcher = undefined;
  };
}

/** WI-041 — clipboard dispatch host slot. DesignPage / FrameStage own
 *  the live selection + pointer state needed for copy/cut/paste, so the
 *  hotkey + ContextMenu surfaces dispatch through this slot. Verbs are
 *  enumerated so the slot can stay React-agnostic. */
export type ClipboardVerb = "copy" | "cut" | "paste" | "pasteSpecial";
let clipboardDispatcher: ((verb: ClipboardVerb) => void) | undefined;
export function setClipboardDispatcher(fn: (verb: ClipboardVerb) => void): () => void {
  clipboardDispatcher = fn;
  return () => {
    if (clipboardDispatcher === fn) clipboardDispatcher = undefined;
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
  // ── Z-order (WI-038) ──────────────────────────────────────────────────
  // Figma-parity bindings — `]` / `[` move one step, `Cmd+]` / `Cmd+[`
  // jump to extremes. The action closures look up the currently-selected
  // item id via the host slot (`setZOrderDispatcher`) and dispatch the
  // matching `weave.item.*` command. enabledWhen guards on
  // `hasFrameSelection` so the binding is a no-op when nothing is
  // selected. The hotkey registry already skips text-editing surfaces
  // so `]` / `[` stay typeable inside Lexical / inputs.
  {
    id: "zorder.bringForward",
    label: { en: "Bring forward", ko: "앞으로" },
    description: {
      en: "Move the selected item one step toward the front within its parent.",
      ko: "선택한 항목을 부모 안에서 한 단계 앞으로 이동합니다.",
    },
    hotkey: { keys: "]", binding: "]", scope: "editor" },
    category: "arrange",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      zorderDispatcher?.("bringForward");
    },
  },
  {
    id: "zorder.sendBackward",
    label: { en: "Send backward", ko: "뒤로" },
    description: {
      en: "Move the selected item one step toward the back within its parent.",
      ko: "선택한 항목을 부모 안에서 한 단계 뒤로 이동합니다.",
    },
    hotkey: { keys: "[", binding: "[", scope: "editor" },
    category: "arrange",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      zorderDispatcher?.("sendBackward");
    },
  },
  {
    id: "zorder.bringToFront",
    label: { en: "Bring to front", ko: "맨 앞으로" },
    description: {
      en: "Move the selected item to the very front of its parent.",
      ko: "선택한 항목을 부모 안의 맨 앞으로 이동합니다.",
    },
    hotkey: { keys: "⌘ + ]", binding: "Mod+]", scope: "editor" },
    category: "arrange",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      zorderDispatcher?.("bringToFront");
    },
  },
  {
    id: "zorder.sendToBack",
    label: { en: "Send to back", ko: "맨 뒤로" },
    description: {
      en: "Move the selected item to the very back of its parent.",
      ko: "선택한 항목을 부모 안의 맨 뒤로 이동합니다.",
    },
    hotkey: { keys: "⌘ + [", binding: "Mod+[", scope: "editor" },
    category: "arrange",
    enabledWhen: (ctx) => Boolean(ctx.hasFrameSelection),
    action: () => {
      zorderDispatcher?.("sendToBack");
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
  //
  // WI-036 follow-up — `frame.duplicate` was retired after user
  // testing surfaced that its action dispatched a fresh `addItem` of
  // the same kind (no attrs copy), which behaved indistinguishably
  // from `frame.addChild`. A real duplicate (deep-clone of attrs +
  // children) is a separate WI; until then the command is gone so
  // the QuickActionBar shows only `+` and `✕` (add + delete).
  // WI-035 P2 — "+" QuickActionBar button on hovered frames. Click
  // inserts a default-sized child frame; the closure (DesignPage) owns
  // the actual `weave.item.add` exec via the `hoverFrameChildAdder`
  // host slot. visibleWhen restricts to `frame` kind only (primitives
  // can't host children).
  {
    id: "frame.addChild",
    label: { en: "Add child frame", ko: "자식 프레임 추가" },
    hint: {
      en: "Insert a default-sized frame here.",
      ko: "이 프레임 안에 새 프레임을 추가합니다.",
    },
    category: "frame",
    // WI-036 follow-up — QuickActionBar pivoted from hover-driven to
    // selection-driven. visibleWhen / enabledWhen read the SELECTED
    // frame's kind / id instead of the hovered one.
    visibleWhen: (ctx) => ctx.selectedKind === "frame",
    enabledWhen: (ctx) => typeof ctx.selectedId === "string",
    action: () => {
      // Dispatched via hoverFrameChildAdder slot (still named after
      // the original hover origin; the slot itself is paradigm-blind).
    },
  },
  {
    id: "frame.delete",
    label: { en: "Delete", ko: "삭제" },
    hint: { en: "Remove this frame.", ko: "이 프레임을 삭제합니다." },
    category: "frame",
    visibleWhen: (ctx) =>
      ctx.selectedKind === "frame" ||
      ctx.selectedKind === "image" ||
      ctx.selectedKind === "video" ||
      ctx.selectedKind === "shape" ||
      ctx.selectedKind === "text",
    enabledWhen: (ctx) => typeof ctx.selectedId === "string",
    action: () => {
      // Dispatched via frameDeleter slot.
    },
  },
  {
    id: "image.replaceSrc",
    label: { en: "Replace image", ko: "이미지 교체" },
    hint: { en: "Open the media picker.", ko: "이미지 소스를 변경합니다." },
    category: "image",
    visibleWhen: (ctx) => ctx.selectedKind === "image",
    enabledWhen: (ctx) => typeof ctx.selectedId === "string",
    action: () => {
      // Dispatched via mediaSrcOpener slot.
    },
  },
  {
    id: "video.replaceSrc",
    label: { en: "Replace video", ko: "비디오 교체" },
    hint: { en: "Open the media picker.", ko: "비디오 소스를 변경합니다." },
    category: "video",
    visibleWhen: (ctx) => ctx.selectedKind === "video",
    enabledWhen: (ctx) => typeof ctx.selectedId === "string",
    action: () => {
      // Dispatched via mediaSrcOpener slot.
    },
  },
  // WI-041 — clipboard commands. The four entries share a single
  // host slot (`setClipboardDispatcher`) that closes over the live
  // selection / pointer state in DesignPage. enabledWhen guards
  // both the keyboard registration and the ContextMenu item's
  // disabled state via `editorCommandMetadata.isEnabled(id, ctx)`.
  // copy / cut require a non-text selection (a Lexical-focused
  // user gets the browser's native copy instead); paste only
  // needs a non-text focus + a non-empty clipboard store. Phase
  // 6 will activate the pasteSpecial flow; v1 ships its dialog as
  // an "in progress" stub so the Cmd+Opt+V hotkey is reserved.
  {
    id: "weave.clipboard.copy",
    label: { en: "Copy", ko: "복사" },
    description: {
      en: "Copy the selected item to the clipboard.",
      ko: "선택한 항목을 클립보드에 복사합니다.",
    },
    hotkey: { keys: "⌘ + C", binding: "Mod+C", scope: "editor" },
    category: "clipboard",
    enabledWhen: (ctx) =>
      !ctx.isTextEditing && (Boolean(ctx.hasFrameSelection) || typeof ctx.selectedId === "string"),
    action: () => {
      clipboardDispatcher?.("copy");
    },
  },
  {
    id: "weave.clipboard.cut",
    label: { en: "Cut", ko: "잘라내기" },
    description: {
      en: "Cut the selected item to the clipboard.",
      ko: "선택한 항목을 잘라내어 클립보드에 보관합니다.",
    },
    hotkey: { keys: "⌘ + X", binding: "Mod+X", scope: "editor" },
    category: "clipboard",
    enabledWhen: (ctx) =>
      !ctx.isTextEditing && (Boolean(ctx.hasFrameSelection) || typeof ctx.selectedId === "string"),
    action: () => {
      clipboardDispatcher?.("cut");
    },
  },
  {
    id: "weave.clipboard.paste",
    label: { en: "Paste", ko: "붙여넣기" },
    description: {
      en: "Paste the most recent clipboard item into the current frame.",
      ko: "클립보드의 항목을 현재 프레임에 붙여넣습니다.",
    },
    hotkey: { keys: "⌘ + V", binding: "Mod+V", scope: "editor" },
    category: "clipboard",
    enabledWhen: (ctx) => !ctx.isTextEditing && ctx.clipboardHasItems === true,
    action: () => {
      clipboardDispatcher?.("paste");
    },
  },
  {
    id: "weave.clipboard.pasteSpecial",
    label: { en: "Paste Special…", ko: "선택하여 붙여넣기…" },
    description: {
      en: "Open the Paste Special dialog (style only, text only, …). Coming soon.",
      ko: "선택하여 붙여넣기 대화상자를 엽니다 (스타일만, 텍스트만 등). 곧 제공됩니다.",
    },
    hotkey: { keys: "⌘ + ⌥ + V", binding: "Mod+Alt+V", scope: "editor" },
    category: "clipboard",
    enabledWhen: (ctx) => !ctx.isTextEditing && ctx.clipboardHasItems === true,
    action: () => {
      clipboardDispatcher?.("pasteSpecial");
    },
  },
  // WI-036 follow-up — multi-selection commands. visibleWhen reads
  // `selectedKind === "multi"` (the host sets this when selection
  // size > 1). Only `multi.delete` ships in v1; align / distribute
  // / group are v1.x backlog.
  {
    id: "multi.delete",
    label: { en: "Delete selected", ko: "선택 항목 삭제" },
    hint: {
      en: "Remove every item in the current multi-selection.",
      ko: "현재 다중 선택한 모든 항목을 삭제합니다.",
    },
    category: "multi",
    visibleWhen: (ctx) => ctx.selectedKind === "multi",
    enabledWhen: (ctx) => {
      const count = ctx.selectionCount;
      return typeof count === "number" && count > 1;
    },
    action: () => {
      // Dispatched via multiDeleter slot.
    },
  },
];

/** Bridge between dispatchEditorCommand and host-supplied action slots.
 *  Called from dispatchEditorCommand for command ids whose static
 *  `action` is a no-op (the host owns the closure). */
function tryHostSlot(id: string, ctx: Readonly<Record<string, unknown>> | undefined): boolean {
  // WI-036 follow-up — QuickActionBar now reads SELECTION state, not
  // hover. The slot dispatch mirrors: pull `selectedId` /
  // `selectedKind` from the host's commandContext.
  const selectedId = typeof ctx?.selectedId === "string" ? ctx.selectedId : undefined;
  const selectedKind = typeof ctx?.selectedKind === "string" ? ctx.selectedKind : undefined;
  if (id === "frame.duplicate" && frameDuplicator !== undefined && selectedId !== undefined) {
    frameDuplicator(selectedId);
    return true;
  }
  if (id === "frame.delete" && frameDeleter !== undefined && selectedId !== undefined) {
    frameDeleter(selectedId);
    return true;
  }
  if (id === "frame.addChild" && hoverFrameChildAdder !== undefined && selectedId !== undefined) {
    hoverFrameChildAdder(selectedId);
    return true;
  }
  if (id === "multi.delete" && multiDeleter !== undefined) {
    multiDeleter();
    return true;
  }
  if (
    id === "image.replaceSrc" &&
    mediaSrcOpener !== undefined &&
    selectedId !== undefined &&
    selectedKind === "image"
  ) {
    mediaSrcOpener("image", selectedId);
    return true;
  }
  if (
    id === "video.replaceSrc" &&
    mediaSrcOpener !== undefined &&
    selectedId !== undefined &&
    selectedKind === "video"
  ) {
    mediaSrcOpener("video", selectedId);
    return true;
  }
  return false;
}

/** Module-level registry. Populated once at import time so every
 *  consumer (tooltip, button, palette) shares the same metadata
 *  identity. Adding a command above auto-flows into this registry. */
export const editorCommandMetadata: CommandMetadataRegistry = createCommandMetadataRegistry();

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

    // WI-035 IME-safety — Korean (and other composition-based) IMEs
    // replace `KeyboardEvent.key` with "Process" while a composition is
    // pending, so the agocraft hotkey registry (which matches by `key`)
    // misses the tool shortcuts when 한글 입력모드 is on. Match by
    // `KeyboardEvent.code` instead — the physical key code is layout
    // AND IME independent. Each command id below is also skipped in
    // the registry-based registration loop so the tool shortcut never
    // double-fires.
    const IME_SAFE_TOOL_BINDINGS: Readonly<Record<string, string>> = {
      KeyR: "tool.addRect",
      KeyT: "tool.addText",
      KeyF: "tool.addFrame",
    };
    const IME_SAFE_COMMAND_IDS = new Set(Object.values(IME_SAFE_TOOL_BINDINGS));

    const offs = EDITOR_COMMANDS.flatMap((cmd) => {
      if (cmd.hotkey === undefined) return [];
      if (IME_SAFE_COMMAND_IDS.has(cmd.id)) return [];
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

    const codeUnsub = bus.subscribe((ev) => {
      if (ev.kind !== "key" || ev.phase !== "down" || ev.repeat) return;
      // Tool shortcuts are plain (no modifier). Skip when any modifier
      // is held so combinations stay free for future bindings.
      if (ev.modifiers.shift || ev.modifiers.meta || ev.modifiers.ctrl || ev.modifiers.alt) return;
      const cmdId = IME_SAFE_TOOL_BINDINGS[ev.code];
      if (cmdId === undefined) return;
      if (isTextEditingTarget(ev.target)) return;
      ev.raw.preventDefault();
      findAction(cmdId)?.({ editor: editorRef.current });
    });

    return () => {
      codeUnsub();
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
