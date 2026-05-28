import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  defaultShapeSubAttrs,
  type ShapeSubKind,
} from "@agocraft/core";
import { EditorProvider, useEditorVM } from "@agocraft/editor/react";
import {
  type AITooltipHotkeyTable,
  Button,
  ColorPicker,
  CommandHostProvider,
  CommandIconButton,
  CommandPalette,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HoverAffordanceLayer,
  IconAlignBottom,
  IconAlignHorizontalCenter,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconAlignVerticalCenter,
  IconButton,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconCursor,
  IconDistributeHorizontal,
  IconDistributeVertical,
  IconHand,
  IconLayers,
  IconPlay,
  IconPlus,
  IconRedo,
  IconUndo,
  Spinner,
  QuickActionBar,
  ThemeSwitcher,
  UnifiedTooltip,
  useCommandHost,
} from "@weave/design-system";
import type { ReactNode as ReactNodeAlias } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import {
  type DocFlavor,
  type DomainKind,
  firstChildOf,
  InteractionModeProvider,
  type ItemFrame,
  nextSiblingOf,
  PeekActiveProvider,
  parentOf,
  prevSiblingOf,
  SelectionProvider,
  useDesign,
  useEditAffordancesAllowed,
  useInteractionMode,
  useSelection,
  useSelectionChromeVisible,
  useTooltipsAllowed,
} from "../document";
import {
  absoluteFrameBox,
  findItemDeep,
  findParentAndIndex,
  findTrailDeep,
} from "../document/agocraft-mirror.js";
import { clipboardStore } from "../document/clipboard/clipboard-store.js";
import { PasteSpecialDialog } from "../document/clipboard/PasteSpecialDialog.js";
import { computeAlignedFrames } from "../document/multi/align-ops.js";
import { useClipboardCommands } from "../document/clipboard/use-clipboard-commands.js";
import { useIsTextEditing } from "../document/clipboard/use-is-text-editing.js";
import { EditorVMProvider } from "../document/interactions/editor-vm-context.js";
import {
  buildFrameTree,
  type FrameTreeNode,
  resolvePickerTargetId,
} from "../document/interactions/frame-tree.js";
import { ReparentGhostOverlay } from "../document/interactions/ReparentGhostOverlay.js";
import { RouterProvider } from "../document/interactions/router-context.js";
import { SelectionChromeProvider } from "../document/interactions/selection-chrome-context.js";
import { useHoverContext } from "../document/interactions/use-hover-context.js";
import { useGridCellDragController } from "../document/interactions/use-grid-cell-drag-controller.js";
import { useReparentDragController } from "../document/interactions/use-reparent-drag-controller.js";
import {
  findFramesAtPoint,
  type LayerHit,
  LayerPickerMenu,
} from "../document/layer-picker/index.js";
import { PeekOverlay, PointStackInspector, usePeekMode } from "../document/peek-mode/index.js";
import { PresenceCursors } from "../document/presence/PresenceCursors.js";
import { usePresenceLocalCursor } from "../document/presence/use-presence-local-cursor.js";
import { projectHoverAffordance } from "../document/render/hover-affordance-projector.js";
import { createSlideBulletHandleViewModel } from "../document/selection-chrome/slide-bullet-handle.js";
import { DocumentForResolutionProvider } from "../document/style/resolver-context.js";
import { ContextualToolbar } from "../document/toolbar/ContextualToolbar.js";
import { MediaSrcDialog } from "../document/toolbar/MediaSrcDialog.js";
import { CursorTooltipBridge } from "../document/tooltip/CursorTooltipBridge.js";
import {
  dispatchEditorCommand,
  editorCommandMetadata,
  type ItemAdderKind,
  type SelectionNavDir,
  type MultiAlignOp,
  setFrameDeleter,
  setFrameDuplicator,
  setHoverFrameChildAdder,
  setItemAdder,
  setMediaSrcOpener,
  setMultiAligner,
  setMultiDeleter,
  setDesignSaver,
  setPaletteOpener,
  setSelectionNavigator,
  setZOrderDispatcher,
  useEditorHotkeys,
  type ZOrderDir,
} from "../document/tooltip/editor-hotkeys.js";
import { MigrationResultBanner } from "../document/MigrationResultBanner.js";
import { useMigrateInlineMedia } from "../document/use-migrate-inline-media.js";
import { useWeaveEditor } from "../document/use-weave-editor.js";
import { registerZOrderAdapters } from "../document/zorder/register.js";
import { FigmaSelectionLaunchBanner } from "../launch/FigmaSelectionLaunchBanner.js";
import { TextV1LaunchBanner } from "../launch/TextV1LaunchBanner.js";
import { FrameStage } from "./FrameStage.js";
import { SlidePresetPicker } from "./new-design/SlidePresetPicker.js";
import { ThumbnailPanel } from "./ThumbnailPanel.js";

/** WI-039 — z-order focus gate set computation.
 *
 *  Walks the trail from doc root to the focused frame and collects every
 *  frame id that should be visually + interactively suppressed for the
 *  given mode. Returns the empty set when the focused frame doesn't
 *  exist (it was deleted while focused — the host's clear-on-removal
 *  effect tidies up shortly after).
 *
 *  `mode = "above"` (stage 1): at every ancestor, take only the children
 *  whose paint order is AFTER the trail element. This yields true z-order
 *  above across nested levels — including later siblings of any ancestor,
 *  not just same-parent siblings of the focused frame.
 *
 *  `mode = "outside"` (stage 2): at every ancestor, take every child
 *  except the trail element. Yields the entire complement of the focused
 *  frame's subtree (siblings + their subtrees + cousins + their subtrees,
 *  recursively). Ancestors themselves stay untouched so the DOM chain
 *  that mounts the focused frame still paints and receives events.
 *
 *  Descendants of each collected sibling are added explicitly. Opacity
 *  inherits through CSS, but `pointer-events` is re-applied per frame
 *  wrapper by FrameStage's hit gate, so a parent-only set would let
 *  descendants stay interactive. Including every id in the set lets the
 *  per-frame gate enforce the block uniformly. */
function collectFocusGateIds(
  doc: AgocraftDocument,
  focusedId: string,
  mode: "above" | "outside",
): ReadonlySet<string> {
  const trail = findTrailDeep(doc, focusedId);
  if (trail === undefined) return new Set<string>();
  // trail = [root.child_in_path, ..., focused]; focused itself sits at
  // trail[trail.length - 1]. Ancestors that own a child in the trail are:
  // root, trail[0], trail[1], ..., trail[trail.length - 2].
  const out = new Set<string>();
  const addSubtree = (item: AgocraftItem): void => {
    out.add(String(item.id));
    for (const c of item.children) addSubtree(c);
  };
  const collectLevel = (parent: AgocraftItem, trailChild: AgocraftItem): void => {
    const idx = parent.children.findIndex((c) => String(c.id) === String(trailChild.id));
    if (idx < 0) return;
    const start = mode === "above" ? idx + 1 : 0;
    for (let i = start; i < parent.children.length; i += 1) {
      if (mode === "outside" && i === idx) continue;
      const sibling = parent.children[i];
      if (sibling !== undefined) addSubtree(sibling);
    }
  };
  const firstTrail = trail[0];
  if (firstTrail !== undefined) collectLevel(doc.root, firstTrail);
  for (let k = 0; k < trail.length - 1; k += 1) {
    const ancestor = trail[k];
    const next = trail[k + 1];
    if (ancestor !== undefined && next !== undefined) collectLevel(ancestor, next);
  }
  return out;
}

/** Mounts the single UnifiedTooltip surface and disables it whenever the
 *  editor's InteractionMode is not in a tooltip-friendly state (rubber-
 *  band, frame manipulating, panning, context menu open, …).  Sits one
 *  level below the InteractionModeProvider so its hook resolves the live
 *  mode the canvas surfaces publish into. */
function ModeAwareTooltipSurface({ children }: { readonly children: ReactNodeAlias }) {
  const tooltipsAllowed = useTooltipsAllowed();
  return (
    <>
      {children}
      <UnifiedTooltip disabled={!tooltipsAllowed} />
    </>
  );
}

/** Per-frame context menu — wires the Radix open/close into the editor's
 *  interaction mode so other sources (rubber-band, tooltips, frame-click
 *  selection) stand down while the menu is on screen. Lives in this file
 *  because the menu's actions close over DesignPage's editor handles.
 *
 *  WI-033 A4 — also hosts the Layer Picker section at the top when the
 *  caller supplies `layers` (frames overlapping the right-clicked point,
 *  deepest-first). Empty `layers` → the section is elided so frames
 *  with no overlap render the legacy menu unchanged. */
function FrameContextMenu({
  itemId,
  onDelete,
  onZOrder,
  reparentTree,
  onReparent,
  onClipboard,
  clipboardHasItems,
  children,
  layers,
  onPickLayer,
  onHoverPreview,
}: {
  readonly itemId: string;
  readonly onDelete: () => void;
  /** WI-038 — fires when the user picks one of the four z-order rows.
   *  No-op when the host doesn't supply a handler (e.g., legacy contexts
   *  that haven't been migrated). */
  readonly onZOrder?: (dir: ZOrderDir) => void;
  /** WI-039 — flat depth-list of frames for the "Move to…" sub-menu.
   *  Each row includes `disabled` for cycle targets. Undefined skips
   *  the sub-menu entirely (legacy mounts). */
  readonly reparentTree?: ReadonlyArray<FrameTreeNode>;
  /** WI-039 — fires with the picker's row id ("@root" or a frame id)
   *  when the user picks a Move-to target. */
  readonly onReparent?: (targetId: string) => void;
  /** WI-041 — clipboard verb dispatch. Undefined hides the four
   *  copy/cut/paste/paste-special rows entirely. */
  readonly onClipboard?: (verb: "copy" | "cut" | "paste" | "pasteSpecial") => void;
  /** WI-041 — disables the Paste / Paste Special rows when the clipboard
   *  store is empty. */
  readonly clipboardHasItems?: boolean;
  readonly children: ReactNodeAlias;
  readonly layers?: ReadonlyArray<LayerHit>;
  readonly onPickLayer?: (id: string) => void;
  readonly onHoverPreview?: (id: string | null) => void;
}) {
  const { setMode, restoreIdleFrom } = useInteractionMode();
  // WI-033 A4 — Layer Picker is elided when there's fewer than 2
  // overlapping frames at the cursor. A list of one (the frame the
  // user already right-clicked) is pure noise; Figma elides on the
  // same condition.
  const hasLayers = layers !== undefined && layers.length >= 2 && onPickLayer !== undefined;
  return (
    <ContextMenu
      key={itemId}
      onOpenChange={(open) => {
        if (open) setMode("context-menu");
        else restoreIdleFrom("context-menu");
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {hasLayers && (
          <>
            <LayerPickerMenu
              layers={layers!}
              onPickLayer={onPickLayer!}
              {...(onHoverPreview !== undefined ? { onHoverPreview } : {})}
            />
            <ContextMenuSeparator />
          </>
        )}
        {/* WI-033 P2 — "Enter frame" / drill-in entry was removed
            (Phase 12 drill-in mode is being deprecated, DR-017).
            Selection-only navigation is the Figma-aligned paradigm;
            cursor / Enter hotkey / Layer Picker cover the deeper
            navigation cases. */}
        {onClipboard !== undefined && (
          <>
            <ContextMenuItem
              onSelect={() => onClipboard("copy")}
              shortcut="⌘ C"
              data-testid="ctx-copy"
            >
              복사
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onClipboard("cut")}
              shortcut="⌘ X"
              data-testid="ctx-cut"
            >
              잘라내기
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onClipboard("paste")}
              shortcut="⌘ V"
              disabled={clipboardHasItems !== true}
              data-testid="ctx-paste"
            >
              붙여넣기
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onClipboard("pasteSpecial")}
              shortcut="⌘ ⌥ V"
              disabled={clipboardHasItems !== true}
              data-testid="ctx-paste-special"
            >
              선택하여 붙여넣기…
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {onZOrder !== undefined && (
          <>
            <ContextMenuItem
              onSelect={() => onZOrder("bringToFront")}
              shortcut="⌘ ]"
              data-testid="ctx-bring-to-front"
            >
              맨 앞으로
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onZOrder("bringForward")}
              shortcut="]"
              data-testid="ctx-bring-forward"
            >
              앞으로
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onZOrder("sendBackward")}
              shortcut="["
              data-testid="ctx-send-backward"
            >
              뒤로
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onZOrder("sendToBack")}
              shortcut="⌘ ["
              data-testid="ctx-send-to-back"
            >
              맨 뒤로
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {reparentTree !== undefined && onReparent !== undefined && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger data-testid="ctx-move-to">
                다른 부모로 이동
              </ContextMenuSubTrigger>
              <ContextMenuSubContent data-testid="ctx-move-to-content">
                {reparentTree.map((row) => (
                  <ContextMenuItem
                    key={row.id}
                    data-testid={`ctx-move-to-row-${row.id}`}
                    data-depth={row.depth}
                    disabled={row.disabled}
                    onSelect={() => {
                      if (row.disabled) return;
                      onReparent(row.id);
                    }}
                    style={{ paddingLeft: 10 + row.depth * 12 }}
                  >
                    {row.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onSelect={onDelete}
          variant="danger"
          shortcut="⌫"
          data-testid="ctx-delete-frame"
        >
          삭제
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** WI-028 — collaborative sync (CRDT via @agocraft/sync) feature gate.
 *
 *  Currently OFF. The HTTP-poll provider issues a GET /api/sync/<roomId>/
 *  since every 1500 ms per open tab; while inexpensive per request, the
 *  aggregate against a global-anonymous workspace inflates Vercel +
 *  Upstash usage faster than the collaboration value warrants at this
 *  stage. Re-enable by flipping the constant to `true` (and turning
 *  this into an env-driven flag once we have separate environments to
 *  toggle independently). The entire sync subsystem fan-outs from this
 *  switch — Y.Doc, HttpPollProvider, ChangeStream → Y.Doc mirror,
 *  Phase 3b read loop, presence cursors, snapshot policy, and IndexedDB
 *  offline persistence all gate on `useWeaveEditor`'s `deps.sync` being
 *  defined, so a single `false` here disables everything cleanly.
 *
 *  See `records/work-items/WI-028-collaborative-sync.md` § "Paused
 *  2026-05-25" for the trade-off discussion. */
const SYNC_ENABLED = false;

// Multi-selection align / distribute — the 8 individual ops are
// registered as commands (so their Alt+letter hotkeys and command-
// palette entries keep working) but they are NOT surfaced as separate
// QuickActionBar buttons. One `multi.align` submenu button on the bar
// expands into a dropdown that lists all 8. The bar receives the set
// below via `excludeIds` to filter the individuals out.
const MULTI_ALIGN_INDIVIDUAL_IDS: ReadonlySet<string> = new Set([
  "multi.align-left",
  "multi.align-horizontal-center",
  "multi.align-right",
  "multi.align-top",
  "multi.align-vertical-center",
  "multi.align-bottom",
  "multi.distribute-horizontal",
  "multi.distribute-vertical",
]);

// QuickActionBar `pinToEndIds`: any of these commands, when visible,
// gets sorted to the rightmost slot. The user-visible rule: destructive
// ✕ always lives on the right edge, regardless of the order the
// commands happen to be registered in.
const DELETE_PIN_IDS: ReadonlySet<string> = new Set(["multi.delete", "frame.delete"]);

// Submenu entries — driving data for `<MultiAlignSubmenu>`. Iterating a
// readonly array (instead of switching on the op string inside the
// JSX) keeps the dropdown's body free of branching on the op kind
// (CODE_STRUCTURE_DESIGN_RULES Rule 6). Adding a 9th op = one new row
// here + the matching Icon + editor-hotkeys command + align-ops
// handler.
interface MultiAlignMenuEntry {
  readonly id: string;
  readonly label: string;
  readonly Icon: React.ForwardRefExoticComponent<
    React.PropsWithoutRef<
      React.SVGAttributes<SVGSVGElement> & { readonly size?: number | string }
    > &
      React.RefAttributes<SVGSVGElement>
  >;
  /** First-row in each visual group; the submenu inserts a separator
   *  above entries flagged with `group: "start"`. */
  readonly group?: "start";
}

const MULTI_ALIGN_MENU_ENTRIES: ReadonlyArray<MultiAlignMenuEntry> = [
  { id: "multi.align-left", label: "왼쪽 정렬", Icon: IconAlignLeft },
  {
    id: "multi.align-horizontal-center",
    label: "가로 가운데 정렬",
    Icon: IconAlignHorizontalCenter,
  },
  { id: "multi.align-right", label: "오른쪽 정렬", Icon: IconAlignRight },
  { id: "multi.align-top", label: "위쪽 정렬", Icon: IconAlignTop, group: "start" },
  {
    id: "multi.align-vertical-center",
    label: "세로 가운데 정렬",
    Icon: IconAlignVerticalCenter,
  },
  { id: "multi.align-bottom", label: "아래쪽 정렬", Icon: IconAlignBottom },
  {
    id: "multi.distribute-horizontal",
    label: "가로 같은 간격",
    Icon: IconDistributeHorizontal,
    group: "start",
  },
  {
    id: "multi.distribute-vertical",
    label: "세로 같은 간격",
    Icon: IconDistributeVertical,
  },
];

// DR-design-017 — header manual-save lookup tables. Maps the
// 4-state SaveStatus union (`idle` / `saving` / `saved` / `failed`)
// to its glyph + AITooltip context + action. Each row is a single
// declarative entry per state — adding a fifth state is one row
// here + one branch in handleManualSave, no inline switch (Rule 6).
const SAVE_GLYPH_BY_STATUS = {
  idle: <IconCloudUpload />,
  saving: <Spinner size={18} />,
  saved: <IconCloudCheck />,
  failed: <IconCloudOff />,
} as const;

const SAVE_TOOLTIP_CONTEXT = {
  idle: "현재 디자인 저장",
  saving: "저장 중…",
  saved: "저장됨",
  failed: "저장 실패",
} as const;

const SAVE_TOOLTIP_ACTION = {
  idle: "서버로 즉시 저장",
  saving: "서버 응답 대기 중",
  saved: "서버에 저장됨",
  failed: "다시 시도하려면 클릭",
} as const;

export function DesignPage() {
  return <DesignPageBody />;
}

function DesignPageBody() {
  const params = useParams<{ id: string }>();
  const designId = params.id ?? "";

  const {
    design,
    docInAgocraft,
    addItem: rawAddItem,
    removeItem: rawRemoveItem,
    updateBehavior: rawUpdateBehavior,
    updateItem: rawUpdateItem,
    reset: rawReset,
    applyChange,
    replaceDocument,
    setPresentationOrder,
    reorderRootChildren,
    setDesignBackground,
    persistNow,
    persistNowAwaitable,
    isLoading,
  } = useDesign(designId);
  const { editor, vm, router, selectionChrome, sync } = useWeaveEditor({
    docInAgocraft,
    commandTargets: {
      addItem: rawAddItem,
      removeItem: rawRemoveItem,
      updateItem: rawUpdateItem,
      updateBehavior: rawUpdateBehavior,
      reset: rawReset,
    },
    applyChange,
    persist: persistNow,
    // WI-028 — gated by SYNC_ENABLED at the top of this file. When OFF
    // we still pass `replaceDocumentFromRemote` (cheap — just a ref
    // mirror inside the hook) so flipping the flag back to true is a
    // one-line change with no cascading prop edits. Persistence falls
    // back entirely to cloud-sync.ts's full-PUT path while paused.
    replaceDocumentFromRemote: replaceDocument,
    ...(SYNC_ENABLED ? { sync: { roomId: designId } } : {}),
  });
  void sync; // host-visible bundle; consumed by Phase 4 (presence UI).
  const editorHotkeyTable = useEditorHotkeys(editor);

  // WI-029 R1 Step 2 — design-level mutations route through editor.exec so
  // Cmd+Z / collaborative-sync work. The legacy useDesign setters
  // (setDesignBackground / setPresentationOrder / reorderRootChildren) stay
  // available but bypass history; new call sites should use these wrapped
  // versions. The wrapper-mirror in useDesign's applyChange (R1 Step 1)
  // syncs the wrapper-level fields whenever the patch lands, so legacy
  // readers (design.background / design.presentationOrder) keep working.
  const setDesignBackgroundViaEditor = useCallback(
    (color: string) => {
      editor.exec("weave.design.setBackground", { color });
    },
    [editor],
  );
  const setPresentationOrderViaEditor = useCallback(
    (order: ReadonlyArray<string>) => {
      editor.exec("weave.design.setPresentationOrder", { order });
    },
    [editor],
  );
  const reorderRootChildrenViaEditor = useCallback(
    (order: ReadonlyArray<string>) => {
      editor.exec("weave.design.reorderChildren", { order });
    },
    [editor],
  );
  // WI-038 Phase 2 — peek-driven reorder routes through editor.exec with
  // the active peek container id. The agocraft PeekModeController fires
  // `onCommit(orderedAsc)` with the LOCAL lift stack's new order, but
  // `weave.design.reorderChildren` validates as a full permutation of the
  // container's children. We merge here: walk the container's children,
  // replace each lifted slot with the next id from the new local order;
  // un-lifted children keep their positions. This matches the original
  // WI-019 `reorderRootChildren` helper semantics, generalized to any
  // container.
  //
  // Reads `docInAgocraft` through a ref so the closure is stable for
  // `usePeekMode` (which builds the controller once and captures the
  // callback in `useMemo([index])`).
  const reorderChildrenInContainerViaEditor = useCallback(
    (localOrderAsc: ReadonlyArray<string>, containerId: string) => {
      const doc = docInAgocraftRef.current;
      if (!doc) return;
      const container =
        String(doc.root.id) === containerId
          ? doc.root
          : (findItemDeep(doc, containerId) ?? doc.root);
      const currentIds = container.children.map((c) => String(c.id));
      const localSet = new Set(localOrderAsc);
      const liftedPositions: number[] = [];
      currentIds.forEach((id, i) => {
        if (localSet.has(id)) liftedPositions.push(i);
      });
      if (liftedPositions.length !== localOrderAsc.length) {
        // One of the lifted ids is no longer a child of `containerId`
        // (stale lift set after a remove). Skip silently — peek will
        // refresh on the next cursor probe.
        return;
      }
      const merged = [...currentIds];
      liftedPositions.forEach((pos, i) => {
        merged[pos] = localOrderAsc[i]!;
      });
      // Guard against no-op commits — the controller already filters those
      // but a defense-in-depth check costs nothing.
      const changed = merged.some((id, i) => id !== currentIds[i]);
      if (!changed) return;
      editor.exec("weave.design.reorderChildren", {
        order: merged,
        containerId,
      });
    },
    [editor],
  );
  // WI-038 Phase 2 — the container peek indexes + reorders. Initial value
  // is undefined → usePeekMode falls back to root. The container is
  // recomputed once the selection state below is known, via the effect
  // that watches `selectedFrameId`.
  const [peekContainerId, setPeekContainerId] = useState<string | undefined>(undefined);

  // DR-018 PoC — register slide-only "add bullet" handle. Demonstrates
  // the extension story: a domain view-model contributes a kind-
  // specific handle (only fires when a slide is selected). The default
  // resize / rotate set continues to render alongside; registry merges.
  useEffect(() => {
    return selectionChrome.registerItemViewModel(createSlideBulletHandleViewModel({ editor }));
  }, [selectionChrome, editor]);

  // WI-019 Phase 3 — register design-frame ZOrderCapability adapter for the
  // 4 top-level Frame kinds. Adapter reads through a ref so it always sees
  // the latest document mirror without re-registering on every doc change.
  const docInAgocraftRef = useRef<typeof docInAgocraft>(docInAgocraft);
  docInAgocraftRef.current = docInAgocraft;
  useEffect(() => {
    return registerZOrderAdapters({
      capabilityRegistry: editor.capabilities,
      getDocument: () => docInAgocraftRef.current,
    });
  }, [editor]);

  // WI-019 Phase 3 / WI-038 Phase 2 — Peek mode controller + cursor →
  // design coord translation. The `containerId` selects which Item's
  // children peek indexes; defaults to the document root and switches to
  // the parent of the currently-selected item once selection is wired up
  // (see effect further down).
  const peek = usePeekMode({
    design,
    subscribeToChanges: (h) => editor.changeStream.subscribe(h),
    onReorder: reorderChildrenInContainerViaEditor,
    ...(peekContainerId !== undefined ? { containerId: peekContainerId } : {}),
  });

  // Expose peek controller for e2e diagnostics + dev tools only — never read
  // in production hot-path (use React Context for that).
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __weavePeek?: typeof peek }).__weavePeek = peek;
  }

  // Bounding rect ref for the canvas host — used to translate clientX/Y to
  // design-space coords. The math assumes the design plane is fit-scaled
  // (uniform scale, letterboxed) inside `main`. infiniteCanvas zoom is not
  // accounted for — peek's hit-test will be slightly off when zoomed in/out.
  // Acceptable v1; refine via FrameStage transform exposure in a follow-up.
  //
  // State-backed ref: PeekOverlay needs the DOM element to call
  // querySelector + setAttribute on lifted frames. A plain ref wouldn't
  // trigger PeekOverlay re-render when the element first attaches, so we
  // mirror the ref into state via a callback ref.
  const canvasHostRef = useRef<HTMLElement | null>(null);
  const [canvasHostEl, setCanvasHostEl] = useState<HTMLElement | null>(null);
  const canvasHostCallbackRef = useCallback((el: HTMLElement | null) => {
    canvasHostRef.current = el;
    setCanvasHostEl(el);
  }, []);
  const [peekCursor, setPeekCursor] = useState<{ x: number; y: number } | null>(null);
  const [hostRect, setHostRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = canvasHostEl;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setHostRect(el.getBoundingClientRect()));
    ro.observe(el);
    setHostRect(el.getBoundingClientRect());
    return () => ro.disconnect();
  }, [canvasHostEl]);

  /** Translate a client-space (clientX/Y) pointer position to design-space
   *  (0..design.width / 0..design.height) coordinates.
   *
   *  Implementation samples the actual rendered position of an existing
   *  `[data-frame-id]` element to back out the scale + origin of the
   *  design plane. Prefers a non-lifted sample (lifted frames have a
   *  translateZ applied that distorts their projected size — using one
   *  would skew the derived scale). Falls back to any frame, then to
   *  naive letterbox math when no frame is rendered yet.
   */
  function screenToDesign(clientX: number, clientY: number): { x: number; y: number } | null {
    const host = canvasHostRef.current;
    if (host) {
      const sample =
        host.querySelector("[data-frame-id]:not([data-peek-lifted])") ??
        host.querySelector("[data-frame-id]");
      if (sample instanceof HTMLElement) {
        const id = sample.getAttribute("data-frame-id");
        const item = id ? docInAgocraft.root.children.find((c) => String(c.id) === id) : undefined;
        const frame = item
          ? ((item.attrs as { frame?: { x: number; y: number; width: number; height: number } })
              .frame ?? undefined)
          : undefined;
        if (frame) {
          const rect = sample.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const scaleX = rect.width / (frame.width * design.width);
            const scaleY = rect.height / (frame.height * design.height);
            const originX = rect.left - frame.x * design.width * scaleX;
            const originY = rect.top - frame.y * design.height * scaleY;
            return {
              x: (clientX - originX) / scaleX,
              y: (clientY - originY) / scaleY,
            };
          }
        }
      }
    }
    // Fallback: naive letterbox math (used only when no frames exist).
    const rect = hostRect;
    if (!rect) return null;
    const baseScale = Math.min(rect.width / design.width, rect.height / design.height);
    if (baseScale <= 0) return null;
    const letterboxX = (rect.width - design.width * baseScale) / 2;
    const letterboxY = (rect.height - design.height * baseScale) / 2;
    return {
      x: (clientX - rect.left - letterboxX) / baseScale,
      y: (clientY - rect.top - letterboxY) / baseScale,
    };
  }

  /** Inverse of `screenToDesign` — projects design-space coords to host-
   *  relative pixels (origin at the canvasHost top-left, the same coord
   *  space the absolute-positioned PresenceCursors SVG renders into).
   *  Uses the same frame-sampling fallback chain so the two projectors
   *  stay perfectly inverse even when the user is zoomed via the
   *  infinite-canvas tool. */
  const designToHost = useCallback(
    (designX: number, designY: number): { x: number; y: number } | null => {
      const host = canvasHostRef.current;
      if (!host) return null;
      const hostRectNow = host.getBoundingClientRect();
      const sample =
        host.querySelector("[data-frame-id]:not([data-peek-lifted])") ??
        host.querySelector("[data-frame-id]");
      if (sample instanceof HTMLElement) {
        const id = sample.getAttribute("data-frame-id");
        const item = id ? docInAgocraft.root.children.find((c) => String(c.id) === id) : undefined;
        const frame = item
          ? ((item.attrs as { frame?: { x: number; y: number; width: number; height: number } })
              .frame ?? undefined)
          : undefined;
        if (frame) {
          const rect = sample.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const scaleX = rect.width / (frame.width * design.width);
            const scaleY = rect.height / (frame.height * design.height);
            const originX = rect.left - frame.x * design.width * scaleX;
            const originY = rect.top - frame.y * design.height * scaleY;
            return {
              x: originX + designX * scaleX - hostRectNow.left,
              y: originY + designY * scaleY - hostRectNow.top,
            };
          }
        }
      }
      const baseScale = Math.min(
        hostRectNow.width / design.width,
        hostRectNow.height / design.height,
      );
      if (baseScale <= 0) return null;
      const letterboxX = (hostRectNow.width - design.width * baseScale) / 2;
      const letterboxY = (hostRectNow.height - design.height * baseScale) / 2;
      return {
        x: letterboxX + designX * baseScale,
        y: letterboxY + designY * baseScale,
      };
    },
    [design.width, design.height, docInAgocraft],
  );

  // WI-028 Phase 4 — broadcast local cursor + render remote cursors.
  // Only active when collaborative sync is wired (`sync` is defined).
  // `clientToLocal` reuses `screenToDesign`; presence positions are
  // stored in design-space so remote viewers can map them back to
  // their own host's projected pixels via `designToHost`.
  const clientToLocal = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const p = screenToDesign(clientX, clientY);
      return p ?? { x: 0, y: 0 };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- screenToDesign
    // closes over docInAgocraft + hostRect; both change via React state,
    // so the function identity flips naturally. We re-bind via deps below.
    [docInAgocraft, hostRect],
  );
  usePresenceLocalCursor({
    engine: sync?.engine,
    hostRef: canvasHostRef,
    clientToLocal,
  });

  // Peek drag state — pointerdown on a lifted frame begins the drag; the
  // vertical pointer delta translates to a new rank in the local stack.
  // The id is also mirrored into React state so PeekOverlay can dim the
  // non-dragged frames' borders.
  const peekDragRef = useRef<{
    itemId: string;
    startClientY: number;
    startRank: number;
    pointerId: number;
  } | null>(null);
  const [peekDraggingId, setPeekDraggingId] = useState<string | null>(null);

  function hitTestLifted(designX: number, designY: number): string | null {
    const liftSet = peek.controller.liftSet.get();
    if (!liftSet) return null;
    // Walk highest-z first so a click on overlapping items selects the top.
    // WI-038 Phase 2 — bbox composed via `absoluteFrameBox` so nested items
    // (anything below the root) hit-test against their accumulated parent
    // transform, not the design's outer box.
    for (let i = liftSet.orderedIds.length - 1; i >= 0; i -= 1) {
      const id = liftSet.orderedIds[i];
      if (id === undefined) continue;
      const box = absoluteFrameBox(docInAgocraft, id, design.width, design.height);
      if (!box) continue;
      if (
        designX >= box.x &&
        designX <= box.x + box.w &&
        designY >= box.y &&
        designY <= box.y + box.h
      ) {
        return id;
      }
    }
    return null;
  }

  // labelFor / swatchFor — feed Inspector with meaningful labels.
  // WI-038 Phase 2 — lookup walks the full tree so nested items resolve.
  const labelFor = useCallback(
    (id: string) => {
      const it = findItemDeep(docInAgocraft, id);
      if (!it) return id;
      const kind = it.kind;
      const title =
        (it.attrs as { title?: string; caption?: string; heading?: string; summary?: string })
          .title ??
        (it.attrs as { caption?: string }).caption ??
        (it.attrs as { heading?: string }).heading ??
        (it.attrs as { summary?: string }).summary;
      return title ? `${kind} · ${title}` : kind;
    },
    [docInAgocraft],
  );

  // WI-020 — "+" add menu handler. Defined inline near the trigger because
  // it captures `setSelectedFrameId` which is created later in this function.
  // Keeping the definition lazy avoids a "used before declaration" ordering
  // issue while still letting the JSX reference a stable function via the
  // ref pattern below.
  const setSelectedFrameIdRef = useRef<((id: string | null) => void) | null>(null);
  const addNewItem = useCallback(
    (kind: DomainKind, shapeSubKind?: ShapeSubKind, srcOverride?: string) => {
      const frame = {
        x: 0.3,
        y: 0.3,
        width: 0.4,
        height: 0.4,
        rotation: 0,
      };
      // Compose attrsOverride at creation time. Doing this inside
      // weave.item.add (instead of a follow-up weave.item.update) avoids
      // racing the staging pipeline — the new Item is only visible in
      // `ctx.document` on the next React tick, so a follow-up update can't
      // find it yet.
      const attrsOverride: Record<string, unknown> = {};
      if (kind === "shape" && shapeSubKind && shapeSubKind !== "rectangle") {
        attrsOverride.shape = shapeSubKind;
        attrsOverride.subAttrs = defaultShapeSubAttrs(shapeSubKind);
      }
      if ((kind === "image" || kind === "video") && srcOverride) {
        attrsOverride.src = srcOverride;
      }
      // WI-035 bug fix — DropdownMenu single-click add now respects the
      // current frame selection (was: always root). Selected frame
      // becomes the parent; falling back to root when nothing is
      // selected keeps the empty-design entry point working.
      const containerId = selectedFrameIdRef.current ?? String(docInAgocraft.root.id);
      const result = editor.exec<unknown, string>("weave.item.add", {
        kind,
        containerId,
        frame,
        ...(Object.keys(attrsOverride).length > 0 ? { attrsOverride } : {}),
      });
      if (!result.ok) return;
      setSelectedFrameIdRef.current?.(result.value);
    },
    [editor, docInAgocraft],
  );

  // Pending media-src modal. Three actions:
  //   - "add" : create a new image/video item with the entered URL
  //   - "edit": replace src on the currently selected media item
  //   - "fill": replace the selected shape's `attrs.fill` with image/video paint
  type PendingMedia =
    | { readonly action: "add"; readonly kind: "image" | "video" }
    | { readonly action: "edit"; readonly kind: "image" | "video" }
    | {
        readonly action: "fill";
        readonly kind: "image" | "video";
        readonly itemId: string;
        readonly initialSrc: string;
      };
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);

  // Retro-active inline-media migration. Fires once per editor mount,
  // walks the loaded design for `data:` URL image attrs.src, uploads
  // each to `/api/resources`, then POSTs a NEW design entity carrying
  // the cloud URLs. The source design (with data URLs) stays untouched
  // on the server. localStorage is not involved on either side. The
  // returned status flows into MigrationResultBanner below — done /
  // failed terminals surface a non-blocking announcement; idle and
  // running are intentionally suppressed so quick migrations do not
  // flash.
  const migrationStatus = useMigrateInlineMedia({ design, document: docInAgocraft });

  // WI-030 — Slide preset picker open state. The Add menu's "슬라이드" item
  // opens this dialog instead of immediately inserting a blank slide.
  const [slidePickerOpen, setSlidePickerOpen] = useState(false);

  // DR-design-017 — manual cloud save. The ChangeStream debounced sink in
  // useWeaveEditor already mirrors every patch to the cloud via
  // `persistNow`, so this button is a *force-now* affordance: the user
  // wants to commit a session-final state immediately (e.g. before
  // closing the tab on a slow network where the debounce window hasn't
  // elapsed).
  //
  // 4-state machine:
  //   idle    → IconCloudUpload (default)
  //   saving  → Spinner          (round-trip in flight)
  //   saved   → IconCloudCheck   (success flash, 1500ms then idle)
  //   failed  → IconCloudOff     (cloud round-trip failed, 4000ms then idle)
  //
  // Failure flash is longer than success because the user needs more
  // time to register that the save did NOT land — and the button
  // remains clickable in the `failed` state so the user can retry.
  type SaveStatus = "idle" | "saving" | "saved" | "failed";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveFlashTimerRef = useRef<number | null>(null);
  const handleManualSave = useCallback(async () => {
    if (saveFlashTimerRef.current !== null) {
      window.clearTimeout(saveFlashTimerRef.current);
      saveFlashTimerRef.current = null;
    }
    setSaveStatus("saving");
    const ok = await persistNowAwaitable();
    setSaveStatus(ok ? "saved" : "failed");
    const flashMs = ok ? 1500 : 4000;
    saveFlashTimerRef.current = window.setTimeout(() => {
      setSaveStatus("idle");
      saveFlashTimerRef.current = null;
    }, flashMs);
  }, [persistNowAwaitable]);
  useEffect(() => {
    return () => {
      if (saveFlashTimerRef.current !== null) {
        window.clearTimeout(saveFlashTimerRef.current);
      }
    };
  }, []);

  const swatchFor = useCallback(
    (id: string) => {
      // WI-038 Phase 2 — lookup walks the full tree so nested items resolve.
      const it = findItemDeep(docInAgocraft, id);
      if (!it) return "rgba(255,255,255,0.12)";
      // Map domain kind → domain accent (defined in design-system tokens).
      const tone: Record<string, string> = {
        slide: "var(--domain-slide-accent, #a0c4ff)",
        "canvas-design": "var(--domain-canvas-accent, #ffb4a2)",
        "block-doc": "var(--domain-block-accent, #caffbf)",
        media: "var(--domain-media-accent, #ffd6a5)",
      };
      return tone[it.kind] ?? "rgba(255,255,255,0.18)";
    },
    [docInAgocraft],
  );

  // Dev-only diagnostics surface. Production code reads vm via
  // `InteractionModeProvider` / `SelectionProvider` React Context, not via
  // window globals — see `apps/web/CLAUDE.md` § "window.__weave* globals".
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __weaveEditor?: typeof editor }).__weaveEditor = editor;
    (window as unknown as { __weaveDoc?: typeof docInAgocraft }).__weaveDoc = docInAgocraft;
    (window as unknown as { __weaveDesign?: typeof design }).__weaveDesign = design;
    (window as unknown as { __weaveVm?: typeof vm }).__weaveVm = vm;
    // WI-041 Phase 4 — clipboard peek shim for the cross-tab e2e.
    // `clipboardStore.peek()` is module state; this surface lets a
    // second-tab assertion observe whether the BroadcastChannel /
    // localStorage transport delivered the source tab's payload.
    (window as unknown as { __weaveClipboardPeek?: () => unknown }).__weaveClipboardPeek =
      () => clipboardStore.peek();
    // WI-028 sync diagnostics — only expose when the sync subsystem is
    // actually mounted (gated by `SYNC_ENABLED` at top of file). When
    // the feature is paused, `sync` is undefined and the e2e harness
    // for sync-read-loop is correspondingly skipped.
    if (SYNC_ENABLED) {
      (window as unknown as { __weaveSync?: typeof sync }).__weaveSync = sync;
      void import("yjs").then((Y) => {
        (window as unknown as { __weaveYjs?: typeof Y }).__weaveYjs = Y;
      });
    }
  }

  const container = docInAgocraft.root;
  const containerId = String(container.id);
  const rootFlavor = ((docInAgocraft.root.attrs.flavor as DocFlavor | undefined) ??
    "mixed") as DocFlavor;
  const currentFlavor: DocFlavor = rootFlavor;
  // Mixed flavor activates the Figma-style infinite-canvas surface (pan +
  // user zoom). Stacked flavors keep the legacy fit-to-viewport layout.
  const infiniteCanvas = currentFlavor === "mixed";

  const removeItem = (itemId: string) => editor.exec("weave.item.remove", { itemId, containerId });
  const updateItem: typeof rawUpdateItem = (itemId, patch) =>
    void editor.exec("weave.item.update", { itemId, patch });
  // WI-032 Phase 3b — `weave.shape.update` / `weave.shape.remove` were
  // removed alongside the legacy `canvas-design` kind; shape primitives
  // flow through `updateItem` now.

  // DR-017 — view-state via vm (single source). Previously 5 useState
  // (selection, enteredFrameId, handMode, historyTick) + SelectionContext.
  // The compatibility shim `useSelection` now reads/writes vm.itemSelection
  // and vm.subSelection; downstream call sites are unchanged.
  //
  // We're called from DesignPageBody's function body, which is *outside*
  // the SelectionProvider that the same body's JSX defines. The Provider
  // can't supply us with a vm here, so we pass the vm explicitly. Child
  // components rendered below pick up the same vm via context.
  const { selection, selectedIds, selectFrame, selectFrames, addFrames, toggleFrames } =
    useSelection(vm);
  const selectedFrameId = selection?.kind === "frame" ? selection.id : undefined;
  const isMultiSelect = selectedIds.size > 1;
  // WI-038 Phase 2 — derive peek container from selection. Selecting any
  // item makes peek index THAT item's parent's children (so the user can
  // L+drag to reorder the siblings of the selected item). No selection ⇒
  // root.children (legacy top-level peek behavior). Same semantics as the
  // four `weave.item.*` z-order commands so the two surfaces stay aligned.
  useEffect(() => {
    if (selectedFrameId === undefined) {
      setPeekContainerId(undefined);
      return;
    }
    const found = findParentAndIndex(docInAgocraft, selectedFrameId);
    if (found === undefined) {
      setPeekContainerId(undefined);
      return;
    }
    setPeekContainerId(String(found.parent.id));
  }, [selectedFrameId, docInAgocraft]);
  const onMarqueeSelect = useCallback(
    (intent: "replace" | "add" | "toggle", ids: ReadonlyArray<string>) => {
      if (intent === "replace") {
        selectFrames(ids);
      } else if (intent === "add") {
        addFrames(ids);
      } else {
        toggleFrames(ids);
      }
    },
    [selectFrames, addFrames, toggleFrames],
  );
  const setSelectedFrameId = useCallback(
    (id: string | undefined) => {
      selectFrame(id ?? null);
    },
    [selectFrame],
  );
  // Mirror into the ref the add-menu callback uses (declaration-order safe).
  setSelectedFrameIdRef.current = (id) => setSelectedFrameId(id ?? undefined);

  // WI-039 — z-order focus, two-stage.
  //
  // Each slide tile in ThumbnailPanel cycles through:
  //   undefined        → no focus, every frame renders normally
  //   stage 1 "dim"    → everything painted ABOVE the focused frame +
  //                      descendants in z-order fades to
  //                      `--focus-dim-opacity` AND ignores pointer events.
  //                      The focused tree is unaffected and stays the only
  //                      interactive surface ABOVE the painted z-order line.
  //   stage 2 "isolate"→ everything OUTSIDE the focused frame tree fades
  //                      to `--focus-isolate-opacity` (0 by default) and
  //                      ignores pointer events. Only the focused tree
  //                      remains visible and editable.
  //
  // Both stages block interaction; the difference is the *scope* (above-
  // tree vs. outside-tree) and the *opacity depth* (dim vs. invisible).
  //
  // "Above" is true z-order, not just same-parent siblings: at every
  // ancestor of the focused frame we collect its children that come AFTER
  // the trail element, with their entire subtrees. "Outside" is the same
  // walk but takes all non-trail children at each level.
  //
  // Single-toggle: at most one frame is focused at a time. Cycling a
  // different tile resets the previous stage and restarts the new tile
  // at stage 1 (or jumps to stage 2 via the shift-click power path).
  // Focus is independent of selection — the user can select a frame
  // without focusing it, and vice versa. Esc on the focus toggle button
  // clears focus immediately (handled in ThumbnailPanel).
  type FocusedFrame = { readonly id: string; readonly stage: 1 | 2 };
  const [focused, setFocused] = useState<FocusedFrame | undefined>(undefined);
  const handleCycleFocus = useCallback(
    (id: string, opts?: { readonly skipToIsolate?: boolean }) => {
      const skipToIsolate = opts?.skipToIsolate === true;
      setFocused((curr) => {
        if (curr === undefined || curr.id !== id) {
          return { id, stage: skipToIsolate ? 2 : 1 };
        }
        if (curr.stage === 1) return { id, stage: 2 };
        return undefined;
      });
    },
    [],
  );
  const handleClearFocus = useCallback(() => setFocused(undefined), []);
  // Walk the focused frame's trail and collect every frame id that should
  // be gated out for the given mode. `above` only takes later siblings at
  // each ancestor level; `outside` takes every non-trail sibling at every
  // level. Descendants of each selected sibling are included so the per-
  // frame hit gate in FrameStage blocks pointer events for the whole
  // subtree (CSS opacity inherits but `pointer-events` is re-applied per
  // wrapper, so each descendant id must appear in the set explicitly).
  const dimmedFrameIds = useMemo<ReadonlySet<string>>(() => {
    if (focused?.stage !== 1) return new Set<string>();
    return collectFocusGateIds(docInAgocraft, focused.id, "above");
  }, [focused, docInAgocraft]);
  const isolatedFrameIds = useMemo<ReadonlySet<string>>(() => {
    if (focused?.stage !== 2) return new Set<string>();
    return collectFocusGateIds(docInAgocraft, focused.id, "outside");
  }, [focused, docInAgocraft]);
  // Tiles whose underlying frame is currently gated (dim OR isolate) get
  // a "disabled" treatment in ThumbnailPanel: no hover pop, no click-
  // select, no drag-to-reorder, no keyboard activate. Aligning the panel
  // surface with the canvas surface keeps the "interaction blocked"
  // semantic consistent — a frame that ignores edits should also ignore
  // a click on its thumbnail. The focus toggle button on the tile stays
  // functional so the user can still cycle focus from any tile.
  const disabledFrameIds = useMemo<ReadonlySet<string>>(() => {
    if (dimmedFrameIds.size === 0 && isolatedFrameIds.size === 0) {
      return new Set<string>();
    }
    const merged = new Set<string>(dimmedFrameIds);
    for (const id of isolatedFrameIds) merged.add(id);
    return merged;
  }, [dimmedFrameIds, isolatedFrameIds]);
  // Stage indicator on the design root so peer surfaces (e.g.,
  // ThumbnailPanel) can react via `[data-focus-stage]` selectors
  // without prop drilling. `0` keeps the attribute always present so
  // CSS rules don't have to defend against `undefined`.
  const focusStage: 0 | 1 | 2 = focused?.stage ?? 0;
  // Clear focus when the focused frame is removed from the document.
  useEffect(() => {
    if (focused === undefined) return;
    if (findItemDeep(docInAgocraft, focused.id) === undefined) {
      setFocused(undefined);
    }
  }, [focused, docInAgocraft]);

  // WI-033 P2 dead-code cleanup — `enteredFrameStack` consumer +
  // `setEnteredFrameId` callback removed. Phase 12 drill-in mode is
  // deprecated (DR-017); the vm slot itself stays on agocraft until
  // a follow-up HANDOFF retires it, but weave no longer reads or
  // writes it. The breadcrumb, FrameContextMenu "Enter frame" item,
  // and NestedFrame enteredId/onEnter prop wiring were all removed
  // in the same WI-033 P2 step.

  // V / H tool toggle (Figma parity). Stored on vm.handTool so the
  // FrameStage pan binding consults a single flag.
  const handMode = useEditorVM(vm, (v) => v.handTool.get());

  // WI-039 — Reparent drag controller (Cmd/Ctrl + Shift + drag).
  // Reads the current document + selection on each gesture frame via
  // refs (selectedIdsRef declared below for multi-delete uses the same
  // mirror; rather than duplicate, the controller reaches it via a
  // closure that captures the live `selectedIds` value — both sites
  // share React state, so a re-render between the gesture frames
  // refreshes both). Gated off in hand / peek modes so those tools keep
  // the canvas press exclusively.
  const reparentSelectedIdsRef = useRef(selectedIds);
  reparentSelectedIdsRef.current = selectedIds;
  const reparentDragState = useReparentDragController({
    editor,
    getDocument: () => docInAgocraftRef.current ?? null,
    getSelectedIds: () => reparentSelectedIdsRef.current,
    enabled: !handMode && !peek.isActive,
  });
  // WI-043 — grid cell-swap: plain-dragging the SELECTED grid child swaps its
  // cell with the item it's dropped on. Selection-state based, so a
  // frame-selected drag still moves the frame (even when the grid is full).
  useGridCellDragController({
    editor,
    getDocument: () => docInAgocraftRef.current ?? null,
    getSelectedIds: () => reparentSelectedIdsRef.current,
    enabled: !handMode && !peek.isActive,
  });
  const setHandMode = useCallback(
    (next: boolean) => {
      vm.handTool.set(next);
    },
    [vm],
  );

  // WI-033 P2 — Esc-exits-entered-frame effect removed alongside the
  // drill-in mode. Selection deselect on Esc remains an open question
  // (P3 follow-up); for now the standard browser focus model handles
  // Esc inside text inputs natively.

  // V / H hotkeys for select / hand modes (Figma parity).
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      if (e.key === "v" || e.key === "V") setHandMode(false);
      else if (e.key === "h" || e.key === "H") setHandMode(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infiniteCanvas, setHandMode]);

  // canUndo / canRedo — read directly off `editor.history` with a manual
  // tick. The vm exposes derived `canUndo` / `canRedo` Signals but
  // there's an ordering trap with agocraft's `history.undo()`: inverse
  // patches are emitted through ChangeStream BEFORE the popped entry
  // is moved onto `redoStack`. vm's `modelTick` therefore observes the
  // mid-state where canRedo() is still `false`. Bumping a local tick
  // *after* `editor.history.undo()` returns gives an accurate
  // re-read. Everything else view-state-wise lives on the vm.
  const [historyTick, setHistoryTick] = useState(0);
  void historyTick;
  const canUndo = editor.history.canUndo();
  const canRedo = editor.history.canRedo();
  const bumpHistoryTick = useCallback(() => setHistoryTick((t) => t + 1), []);

  // WI-027 Phase B — pointer-based hover tracker. Reads data-frame-id /
  // data-frame-kind / data-shape-id / data-hotspot-id from the DOM and
  // surfaces the active hover surface in React state. Mounted on the
  // canvas host so only that subtree triggers updates.
  const hoverContext = useHoverContext(canvasHostRef);

  // WI-041 Phase 2/3 — register the clipboard command host slot. The
  // hook subscribes to `clipboardStore` so `hasItems` flips reactively
  // on copy/cut/paste, driving the paste button's enabled state.
  const clipboardCommands = useClipboardCommands({
    editor,
    selectedId: selectedFrameId,
    resolveContainerId: () => {
      // v1 — paste into the document root. Future iterations may honour
      // the hovered frame or the currently-selected frame's container.
      // WI-033 P2 retired the explicit "entered frame" concept, so the
      // host falls back to the root container until a follow-up
      // surfaces a deliberate paste-target picker.
      return undefined;
    },
    resolveSourceContainerId: () => {
      // Cut targets the source item's parent — find it in the live doc.
      if (selectedFrameId === undefined) return undefined;
      const parent = findParentAndIndex(docInAgocraft, selectedFrameId);
      return parent !== undefined ? String(parent.parent.id) : undefined;
    },
    resolveTargetIds: () => {
      // Paste Special targets the currently-selected items. v1
      // single-selection collapses to a one-element array; once
      // WI-036's multi-set graduates, the same call still returns
      // every selected id.
      return Array.from(selectedIds);
    },
    resolveContainerSizePx: () => {
      // FrameStage's host element is the live design plane — its bounding
      // box (in CSS pixels) is the conversion factor we need to project
      // pointer/offset into the parent's 0..1 ratio space (D5).
      const host = canvasHostRef.current;
      if (host === null) return null;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { width: rect.width, height: rect.height };
    },
    resolvePointerInContainer: () => {
      // HoverContext (v1) does not track pixel coordinates yet — only the
      // hovered surface id. The paste resolver therefore takes its
      // offset path, placing the new item at sourceFrame + 8px * N
      // (D5 keyboard-paste fallback). Future PR can wire a pointer
      // tracker if user feedback wants Figma's "paste at cursor".
      return undefined;
    },
  });

  // WI-026 Phase 5 + WI-027 — host context for CommandMetadata.isEnabled
  // AND CommandMetadata.visibleWhen. Each CommandButton calls
  // registry.isEnabled(id, context); QuickActionBar calls
  // registry.listVisible(context). Reference equality on `context`
  // controls re-renders.
  // WI-036 follow-up — selection-driven QuickActionBar. The bar's
  // commands now read `selectedKind` / `selectedId` instead of
  // `hoveredKind` / `hoveredId`. Resolve the selected frame's kind
  // by walking the doc once per selection change.
  //
  // Multi-selection (size > 1) reports `selectedKind = "multi"` so
  // visibleWhen filters surface the `multi.*` command set instead
  // of per-kind ones. Single selection keeps the per-kind kind.
  const selectedKind = useMemo<string | undefined>(() => {
    if (selectedIds.size > 1) return "multi";
    if (selectedFrameId === undefined) return undefined;
    function walk(item: AgocraftItem): string | undefined {
      if (String(item.id) === selectedFrameId) return item.kind;
      for (const c of item.children) {
        const r = walk(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    return walk(docInAgocraft.root);
  }, [docInAgocraft, selectedFrameId, selectedIds]);

  // WI-041 Phase 5 follow-up — reactive `isTextEditing` axis (DR-019 D7).
  // Flips when focus enters / leaves Lexical or any input / textarea.
  // The hotkey path already short-circuits via `isTextEditingTarget`;
  // this React-reactive surface lets the ContextMenu's "Paste" /
  // "Paste Special" entries grey out the same way without a separate
  // poll loop.
  const isTextEditing = useIsTextEditing();

  // Multi-selection same-parent invariant — drives the enabledWhen
  // for every `multi.align-*` / `multi.distribute-*` command. v1 align
  // is same-parent-only; the QuickActionBar greys the buttons out
  // (and hotkeys decline to fire) when the selection straddles parents
  // so the user gets a clear "this combination isn't supported" signal
  // instead of a wrong-coordinate-space operation.
  const multiSameParent = useMemo(() => {
    if (selectedIds.size < 2) return true;
    let firstParentId: string | undefined;
    for (const id of selectedIds) {
      const found = findParentAndIndex(docInAgocraft, id);
      if (found === undefined) return false;
      const pid = String(found.parent.id);
      if (firstParentId === undefined) firstParentId = pid;
      else if (pid !== firstParentId) return false;
    }
    return true;
  }, [selectedIds, docInAgocraft]);

  const commandContext = useMemo<Readonly<Record<string, unknown>>>(
    () => ({
      canUndo,
      canRedo,
      hasSelection: selectedIds.size > 0,
      selectionCount: selectedIds.size,
      // WI-033 A3 — selection.* hotkeys read this to enable Enter / Tab
      // only when a frame is currently selected (shape sub-selection is
      // navigated through the shape's own SelectionLayer, not these
      // hotkeys).
      hasFrameSelection: selectedFrameId !== undefined,
      selectedFrameId,
      selectedKind,
      selectedId: selectedFrameId,
      hoveredKind: hoverContext.hoveredKind,
      hoveredId: hoverContext.hoveredId,
      hoveredRole: hoverContext.hoveredRole,
      // WI-041 — paste button + hotkey enabled state. Drives the
      // ContextMenu's "Paste" / "Paste Special" disabled-look in real
      // time as the clipboard store fills / clears.
      clipboardHasItems: clipboardCommands.hasItems,
      // WI-041 Phase 5 — reactive text-edit gate so any clipboard
      // surface that reads `commandContext` (ContextMenu Paste row,
      // future CommandButtons) greys out while Lexical owns focus.
      isTextEditing,
      // multi.align-* / multi.distribute-* enabledWhen gate.
      multiSameParent,
    }),
    [
      canUndo,
      canRedo,
      selectedIds.size,
      selectedFrameId,
      selectedKind,
      hoverContext.hoveredKind,
      hoverContext.hoveredId,
      hoverContext.hoveredRole,
      clipboardCommands.hasItems,
      isTextEditing,
      multiSameParent,
    ],
  );

  // WI-026 Phase 4 + WI-027 Phase D — dispatch is the host-supplied
  // executor. It looks up the command's runtime action (held in
  // `EDITOR_COMMANDS`) and calls it with the current editor. We pass the
  // current hover context as a third arg so hover-scoped commands
  // (frame.duplicate / frame.delete / image.replaceSrc) can resolve
  // their target via the host slots registered below.
  const dispatchCommand = useCallback(
    (id: string) => {
      // WI-036 follow-up — pass the full commandContext (hover +
      // selection) so the host slot dispatcher can resolve the
      // target from whichever paradigm the command uses. The bar
      // commands prefer selection now; legacy hover-scoped ones
      // (none today) would still see hoverContext keys.
      dispatchEditorCommand(id, { editor }, commandContext);
      bumpHistoryTick();
    },
    [editor, bumpHistoryTick, commandContext],
  );

  // WI-026 Phase 6 — command palette state. The hotkey "palette.open"
  // calls into setPaletteOpener's registered opener (this effect wires
  // it), so opening the palette goes through the same dispatch path
  // as a header click.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setPaletteOpener(() => setPaletteOpen(true)), []);
  // Cmd+S (Mod+S) — manual save hotkey. Same callback as the header
  // IconButton, so the two surfaces stay in lockstep on `saveStatus`
  // ("저장됨" flash flips uniformly whether the user clicks or types).
  // Re-registers when the callback identity changes (after
  // `persistNow` rotates inside useDesign, etc.).
  useEffect(() => setDesignSaver(handleManualSave), [handleManualSave]);

  // WI-033 A3 — register a host-side selection navigator so the four
  // `selection.*` hotkeys (Enter / Shift+Enter / Tab / Shift+Tab) can
  // route through React state without this module owning a vm reference.
  // Latest selection is captured via ref so the navigator closure always
  // reads the current frame without re-registering on every selection
  // change (cheap, but keeps the registration site stable).
  const selectedFrameIdRef = useRef<string | undefined>(selectedFrameId);
  selectedFrameIdRef.current = selectedFrameId;
  useEffect(() => {
    const NAV_HELPERS: Readonly<
      Record<SelectionNavDir, (id: string, doc: AgocraftDocument) => string | undefined>
    > = {
      drillDown: firstChildOf,
      drillUp: parentOf,
      nextSibling: nextSiblingOf,
      prevSibling: prevSiblingOf,
    };
    return setSelectionNavigator((dir) => {
      const currentId = selectedFrameIdRef.current;
      const doc = docInAgocraftRef.current;
      if (currentId === undefined || doc === undefined) return;
      const nextId = NAV_HELPERS[dir](currentId, doc);
      if (nextId !== undefined) selectFrame(nextId);
    });
  }, [selectFrame]);

  // WI-035 P1 — tool hotkey (R / T / L / F) handler. Insert a
  // default-sized item of the requested kind into the currently
  // selected frame (or root.children when nothing is selected). The
  // resulting frame ratio is parent-local: 20% × 20% box at center
  // for rectangle / text, 40%-wide line at vertical middle, 40% × 40%
  // for nested frame. Drag-tuned sizing is the user's job — these
  // are merely sensible starting points so the press-and-place flow
  // remains predictable.
  useEffect(() => {
    const ITEM_ADDER_SPEC: Readonly<
      Record<ItemAdderKind, { readonly kind: DomainKind; readonly frame: ItemFrame }>
    > = {
      addRect: {
        kind: "shape",
        frame: { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 },
      },
      addText: {
        kind: "text",
        frame: { x: 0.4, y: 0.45, width: 0.2, height: 0.1, rotation: 0 },
      },
      addLine: {
        kind: "shape",
        frame: { x: 0.3, y: 0.5, width: 0.4, height: 0.01, rotation: 0 },
      },
      addFrame: {
        kind: "frame",
        frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      },
    };
    return setItemAdder((kind) => {
      const spec = ITEM_ADDER_SPEC[kind];
      const containerId =
        selectedFrameIdRef.current ??
        (docInAgocraftRef.current?.root.id !== undefined
          ? String(docInAgocraftRef.current.root.id)
          : undefined);
      if (containerId === undefined) return;
      editor.exec("weave.item.add", {
        kind: spec.kind,
        containerId,
        frame: spec.frame,
      });
    });
  }, [editor]);

  // WI-027 Phase D — register host action slots for hover-scope commands.
  // The slots receive the hovered frame id from the dispatcher and run
  // the appropriate weave action (delete / duplicate / open media src
  // picker). The slots persist for the lifetime of this component.
  useEffect(() => {
    return setFrameDeleter((frameId) => removeItem(frameId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- removeItem
    // closes over `rawRemoveItem` from useDesign which is stable.
  }, []);
  // WI-036 follow-up — multi-selection delete. Iterates the live
  // `selectedIds` (via ref to avoid re-registering on every selection
  // change) and dispatches `weave.item.remove` for each. After the
  // batch the editor's history records each as a separate undo step;
  // a future `weave.items.removeBatch` macro can collapse them into
  // a single inverse patch.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  useEffect(() => {
    return setMultiDeleter(() => {
      const ids = Array.from(selectedIdsRef.current);
      for (const id of ids) removeItem(id);
      // Drop the selection — the items are gone.
      selectFrame(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- removeItem
    // / selectFrame are stable from useDesign / useSelection.
  }, []);
  // Multi-selection align / distribute — single slot dispatched by the
  // 8 `multi.align-*` / `multi.distribute-*` commands. Steps:
  //   1. Read the live selected ids + doc through refs (selection /
  //      doc swap on every commit; capturing them in a fresh closure
  //      each render would re-register the slot constantly). The doc
  //      ref `docInAgocraftRef` is already established earlier (for
  //      the z-order capability adapter) — we reuse it here.
  //   2. Build the `{ id, frame }[]` input from each item's live frame.
  //      Anything that is not a domain item with a `frame` attribute is
  //      skipped — the same-parent gate above prevents most weirdness
  //      but the helper still needs uniform shapes.
  //   3. Pipe through `computeAlignedFrames(items, op)` — pure math.
  //   4. Dispatch `weave.items.resizeMulti` so the batch lands as one
  //      Change → one undo step (instead of N entries from looping
  //      `weave.item.update`).
  // The hotkey path bypasses each command's `enabledWhen`, so the
  // multiAligner slot has to enforce the same-parent invariant itself
  // — otherwise Alt+A on a cross-parent multi-selection would feed
  // mixed-coordinate-space frames into `computeAlignedFrames` and
  // produce visually wrong results. Captured via ref so the closure
  // stays mount-stable while the value moves with each commit.
  const multiSameParentRef = useRef(multiSameParent);
  multiSameParentRef.current = multiSameParent;
  useEffect(() => {
    return setMultiAligner((op: MultiAlignOp) => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length < 2) return;
      if (!multiSameParentRef.current) return;
      const doc = docInAgocraftRef.current;
      const inputs: ReadonlyArray<{
        readonly id: string;
        readonly frame: { x: number; y: number; width: number; height: number };
      }> = ids.flatMap((id) => {
        const item = findItemDeep(doc, id);
        if (item === undefined) return [];
        const f = (item.attrs as { frame?: ItemFrame }).frame;
        if (f === undefined) return [];
        return [
          { id, frame: { x: f.x, y: f.y, width: f.width, height: f.height } },
        ];
      });
      if (inputs.length < 2) return;
      const out = computeAlignedFrames(inputs, op);
      // Resize batch — emit only items whose frame actually changed so
      // history stays clean (no zero-delta entries for already-aligned
      // input). Approx-equal guard tolerates the FP drift from
      // bbox-center math (`(min + max) / 2 - w / 2`).
      const updates = out.flatMap((o, i) => {
        const prev = inputs[i]!.frame;
        const moved =
          Math.abs(prev.x - o.frame.x) > 1e-9 ||
          Math.abs(prev.y - o.frame.y) > 1e-9 ||
          Math.abs(prev.width - o.frame.width) > 1e-9 ||
          Math.abs(prev.height - o.frame.height) > 1e-9;
        if (!moved) return [];
        return [{ itemId: o.id, frame: o.frame }];
      });
      if (updates.length === 0) return;
      editor.exec("weave.items.resizeMulti", { updates });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs
    // capture the live selection + doc, so this effect only needs to
    // (re)bind the slot once. `editor` is mount-stable.
  }, []);
  useEffect(() => {
    return setFrameDuplicator((frameId) => {
      // Stub: drop a fresh item of the same kind next to the hovered
      // one. Real copy-of-attrs duplication is a follow-up.
      const kind = hoverContext.hoveredKind;
      if (kind === "none" || kind === "handle" || kind === "hotspot" || kind === "background")
        return;
      void frameId;
      rawAddItem(kind as DomainKind);
    });
  }, [rawAddItem, hoverContext.hoveredKind]);
  // WI-035 P2 — QuickActionBar "+" button on hovered frame. Inserts a
  // default-sized child frame directly without a sub-menu (single-
  // click affordance; tool hotkeys + drag-to-add tile cover other kinds).
  useEffect(() => {
    return setHoverFrameChildAdder((parentFrameId) => {
      editor.exec("weave.item.add", {
        kind: "frame",
        containerId: parentFrameId,
        frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      });
    });
  }, [editor]);
  useEffect(() => {
    return setMediaSrcOpener((mediaKind) => {
      // The "edit" action targets the currently-selected media item.
      // For hover-driven invocations we tee up the dialog in edit mode;
      // it inspects the active selection on submit.
      setPendingMedia({ action: "edit", kind: mediaKind });
    });
  }, []);
  // WI-038 — z-order host slot. Resolves the currently-selected item id
  // through `selectedFrameIdRef` and dispatches the matching weave command.
  // Same closure serves the four ContextMenu rows and the four hotkeys
  // (`]` / `[` / `⌘+]` / `⌘+[`).
  useEffect(() => {
    const ZORDER_COMMAND_BY_DIR: Readonly<Record<ZOrderDir, string>> = {
      bringForward: "weave.item.bringForward",
      sendBackward: "weave.item.sendBackward",
      bringToFront: "weave.item.bringToFront",
      sendToBack: "weave.item.sendToBack",
    };
    return setZOrderDispatcher((dir) => {
      const itemId = selectedFrameIdRef.current;
      if (itemId === undefined) return;
      editor.exec(ZORDER_COMMAND_BY_DIR[dir], { itemId });
    });
  }, [editor]);
  // Also re-tick whenever the ChangeStream emits — covers hotkey-driven
  // undo/redo + remote edits that don't go through the toolbar buttons.
  useEffect(() => {
    return editor.changeStream.subscribe(() => setHistoryTick((t) => t + 1));
  }, [editor]);

  return (
    <EditorVMProvider vm={vm}>
      <RouterProvider router={router}>
        <SelectionChromeProvider registry={selectionChrome}>
          <SelectionProvider vm={vm}>
            <InteractionModeProvider vm={vm}>
              <PeekActiveProvider active={peek.isActive}>
                <CommandHostProvider
                  registry={editorCommandMetadata}
                  context={commandContext}
                  locale="ko"
                  dispatch={dispatchCommand}
                >
                  <ModeAwareTooltipSurface>
                    <EditorProvider editor={editor}>
                      <DocumentForResolutionProvider document={docInAgocraft}>
                        {/* WI-039 — z-stack layout. The design surface (`<main>`)
                        fills the entire viewport so the canvas reaches every
                        edge with no chrome gap. Header, launch banners and
                        ThumbnailPanel are absolutely positioned overlays
                        above the main; they each carry their own background
                        + border so they read as floating chrome over the
                        canvas. Prior flex-column layout produced a black
                        gap above the bottom panel because the panel's new
                        bg (intentionally shorter than the tile) exposed the
                        parent's `--bg-page` color through the flex gap. */}
                        <div className="fixed inset-0 bg-[color:var(--bg-page)]">
                          {typeof document !== "undefined" && createPortal(
                          <header
                            // WI-039 — opaque self-background. The original
                            // `bg-[color:var(--surface-1)]` is a translucent
                            // glass token; when the header sat in a flex
                            // child of `bg-[color:var(--bg-page)]` it
                            // composited into a dark glass tone. With the
                            // z-stack the canvas (potentially a light
                            // design background) now sits behind the header,
                            // so the glass token looks washed out. Stacking
                            // `--surface-1` as a flat gradient on top of an
                            // opaque `--bg-page` base reproduces the exact
                            // original perceived color but is now fully
                            // self-contained — no parent bg dependency.
                            //
                            // Portal'd to document.body so its z-index
                            // participates in the root stacking context
                            // alongside the SelectionLayer / MarqueeSelection
                            // / RubberBand portal layers (z 35-45). Without
                            // the portal, the outer `fixed inset-0` wrapper
                            // creates a stacking context that traps any
                            // z-index inside — the chrome would always paint
                            // below the body-portal'd selection chrome.
                            className="fixed inset-x-0 top-0 z-[46] grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-3 md:px-4 h-12 border-b border-[color:var(--surface-1-border)]"
                            style={{
                              background:
                                "linear-gradient(var(--surface-1), var(--surface-1)), var(--bg-page)",
                            }}
                            data-testid="design-header"
                            role="toolbar"
                            aria-label="Edit tools"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Link
                                to="/"
                                className="flex items-center gap-2 no-underline shrink-0 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                                aria-label="Home"
                              >
                                <span
                                  aria-hidden
                                  className="inline-block w-5 h-5 rounded-[var(--radius-sm)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)]"
                                />
                                <span className="text-[13px] font-semibold tracking-tight text-[color:var(--text-strong)]">
                                  weave
                                </span>
                              </Link>
                              <span
                                aria-hidden
                                className="text-[12px] text-[color:var(--text-muted)] px-1"
                              >
                                /
                              </span>
                              {/* WI-033 P2 — Breadcrumb (Phase 12 drill-in trail
                              indicator) removed. Figma-aligned selection
                              navigation has no entered-frame state, so the
                              header only shows the design title. */}
                              <nav
                                className="flex items-center gap-1 text-[12px] text-[color:var(--text-muted)] min-w-0"
                                aria-label="Breadcrumb"
                              >
                                <span className="text-[color:var(--text-strong)] truncate max-w-[280px]">
                                  {design.title}
                                </span>
                              </nav>
                            </div>

                            <div
                              className="flex items-center gap-0.5"
                              role="group"
                              aria-label="Edit tools"
                            >
                              {infiniteCanvas ? (
                                <>
                                  {/* Three tool buttons form a mutually-exclusive toggle
                        group: Select / Hand / Peek. Choosing one
                        deactivates the others (peek's sticky activation
                        included). Peek's hold-mode (L key) remains
                        orthogonal — it engages while held and yields back
                        on release. */}
                                  <IconButton
                                    aria-label="Select tool"
                                    aria-pressed={!handMode && !peek.isActive}
                                    size="sm"
                                    onClick={() => {
                                      setHandMode(false);
                                      peek.deactivateSticky();
                                    }}
                                    data-testid="toolbar-select"
                                    data-active={!handMode && !peek.isActive ? "true" : undefined}
                                    data-tip="선택 도구"
                                    data-tip-kbd="V"
                                    className={
                                      !handMode && !peek.isActive
                                        ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                                        : undefined
                                    }
                                  >
                                    <IconCursor />
                                  </IconButton>
                                  <IconButton
                                    aria-label="Hand tool"
                                    aria-pressed={handMode && !peek.isActive}
                                    size="sm"
                                    onClick={() => {
                                      setHandMode(true);
                                      peek.deactivateSticky();
                                    }}
                                    data-testid="toolbar-hand"
                                    data-active={handMode && !peek.isActive ? "true" : undefined}
                                    data-tip="이동 도구"
                                    data-tip-kbd="H / Space"
                                    className={
                                      handMode && !peek.isActive
                                        ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                                        : undefined
                                    }
                                  >
                                    <IconHand />
                                  </IconButton>
                                  <IconButton
                                    aria-label="Peek z-order"
                                    aria-pressed={peek.isActive}
                                    size="sm"
                                    onClick={peek.toggle}
                                    data-testid="toolbar-peek"
                                    data-active={peek.isActive ? "true" : undefined}
                                    data-tip="Z-순서 보기"
                                    data-tip-kbd="L"
                                    className={
                                      peek.isActive
                                        ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                                        : undefined
                                    }
                                  >
                                    <IconLayers />
                                  </IconButton>
                                  <span
                                    aria-hidden
                                    className="inline-block w-px h-4 bg-[color:var(--surface-1-border)] mx-1.5"
                                  />
                                </>
                              ) : null}
                              {/* WI-020 — Add menu: image / video / 9 shape sub-kinds */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <IconButton
                                    aria-label="Add new item"
                                    size="sm"
                                    data-testid="toolbar-add"
                                    data-tip="추가"
                                    data-tip-kbd="이미지 · 비디오 · 도형"
                                  >
                                    <IconPlus />
                                  </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" sideOffset={6}>
                                  <DropdownMenuLabel>슬라이드</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onSelect={() => setSlidePickerOpen(true)}
                                    data-testid="add-slide"
                                  >
                                    ▭&nbsp;&nbsp;슬라이드…
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>미디어</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setPendingMedia({ action: "add", kind: "image" })
                                    }
                                    data-testid="add-image"
                                  >
                                    이미지
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setPendingMedia({ action: "add", kind: "video" })
                                    }
                                    data-testid="add-video"
                                  >
                                    비디오
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>텍스트</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("text")}
                                    data-testid="add-text"
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        "application/x-weave-add-kind",
                                        "text",
                                      );
                                      e.dataTransfer.effectAllowed = "copy";
                                    }}
                                  >
                                    T&nbsp;&nbsp;텍스트
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel>도형</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "rectangle")}
                                    data-testid="add-shape-rectangle"
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        "application/x-weave-add-kind",
                                        "shape",
                                      );
                                      e.dataTransfer.effectAllowed = "copy";
                                    }}
                                  >
                                    ▭&nbsp;&nbsp;사각형
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "ellipse")}
                                    data-testid="add-shape-ellipse"
                                  >
                                    ◯&nbsp;&nbsp;원
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "line")}
                                    data-testid="add-shape-line"
                                  >
                                    ─&nbsp;&nbsp;선
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "arrow")}
                                    data-testid="add-shape-arrow"
                                  >
                                    →&nbsp;&nbsp;화살표
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "triangle")}
                                    data-testid="add-shape-triangle"
                                  >
                                    △&nbsp;&nbsp;삼각형
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "star")}
                                    data-testid="add-shape-star"
                                  >
                                    ★&nbsp;&nbsp;별
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "polygon")}
                                    data-testid="add-shape-polygon"
                                  >
                                    ⬡&nbsp;&nbsp;다각형
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "heart")}
                                    data-testid="add-shape-heart"
                                  >
                                    ♥&nbsp;&nbsp;하트
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => addNewItem("shape", "speech-bubble")}
                                    data-testid="add-shape-speech-bubble"
                                  >
                                    💬&nbsp;&nbsp;말풍선
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <span
                                aria-hidden
                                className="inline-block w-px h-4 bg-[color:var(--surface-1-border)] mx-1.5"
                              />
                              <CommandIconButton commandId="history.undo" size="sm">
                                <IconUndo />
                              </CommandIconButton>
                              <CommandIconButton commandId="history.redo" size="sm">
                                <IconRedo />
                              </CommandIconButton>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              {/* Design 배경색 — file-level 속성이라 selection 과
                                무관한 영구 chrome 인 header 의 우 cluster 에
                                상주. ContextualToolbar 의 selection==0
                                variant 를 대체. ThemeSwitcher 와 같은
                                design-level 컨트롤 군에 속하므로 인접 배치.
                                `setDesignBackgroundViaEditor` 는
                                weave.design.setBackground 명령을 통해 History
                                를 거치므로 Cmd+Z 가 그대로 작동. ColorPicker 는
                                data-testid 를 trigger 로 전달하지 않으므로
                                span wrapper 로 e2e hook 노출 (inline-flex 로
                                trigger 의 layout 에 영향 X). */}
                              <span data-testid="header-design-background" className="inline-flex">
                                <ColorPicker
                                  value={design.background ?? "#ffffff"}
                                  onValueCommit={(v) => setDesignBackgroundViaEditor(v)}
                                  onValueChange={() => {
                                    /* commit-only */
                                  }}
                                  aria-label="Design background"
                                />
                              </span>
                              <ThemeSwitcher />
                              {/* DR-design-017 — manual cloud save trigger.
                                  Click forces an immediate `persistNow()`
                                  even if the debounced auto-save window
                                  hasn't elapsed. Glyph flashes to a check
                                  for 1.5s after dispatch so the user
                                  sees an explicit acknowledgement (the
                                  cloud POST itself is fire-and-forget). */}
                              <IconButton
                                aria-label="Save design to server"
                                size="sm"
                                onClick={() => void handleManualSave()}
                                disabled={saveStatus === "saving"}
                                data-testid="toolbar-save"
                                data-state={saveStatus}
                                data-tip={SAVE_TOOLTIP_CONTEXT[saveStatus]}
                                data-tip-kbd={SAVE_TOOLTIP_ACTION[saveStatus]}
                                className={
                                  saveStatus === "failed"
                                    ? "text-[color:var(--text-warn,#d97706)]"
                                    : undefined
                                }
                              >
                                {SAVE_GLYPH_BY_STATUS[saveStatus]}
                              </IconButton>
                              <Button size="md" trailingIcon={<IconPlay size={14} />} asChild>
                                <Link
                                  to={`/design/${designId}/present`}
                                  data-testid="toolbar-present"
                                  data-tip="프레젠테이션"
                                  data-tip-kbd="풀스크린"
                                >
                                  Present
                                </Link>
                              </Button>
                            </div>
                          </header>,
                          document.body)}

                          {/* WI-029 R5 + WI-033 P3 — text item v1 +
                          Figma frame selection launch announcements
                          (LG-001 / RISK-001 #6 + RISK-005 #5). Both
                          auto-show during the launch week and fall
                          silent on dismiss / outside the window. */}
                          {/* Launch banners — float just below the header.
                          `pointer-events-none` on the wrapper lets clicks
                          pass through the empty space to main; each banner
                          re-enables `pointer-events-auto` on its own card
                          so its dismiss control stays clickable. */}
                          <div className="absolute inset-x-0 top-12 z-30 px-4 pt-2 flex flex-col gap-2 pointer-events-none [&>*]:pointer-events-auto">
                            <TextV1LaunchBanner />
                            <FigmaSelectionLaunchBanner />
                            <MigrationResultBanner status={migrationStatus} />
                          </div>

                          {/* LS-miss cloud-fetch spinner. Covers the
                              canvas area (top-12 to skip the header
                              chrome) while `useDesign` is awaiting the
                              server snapshot for an id that wasn't
                              cached locally — duplicate / migrate
                              destinations, fresh-tab cold loads, etc.
                              z-20 sits above the canvas (z-auto) and
                              below the header (z-30), so the user can
                              still see "weave / title" and bail back
                              via the home link. */}
                          {isLoading && (
                            <div
                              className="absolute inset-x-0 bottom-0 top-12 z-20 flex items-center justify-center bg-[color:var(--bg-page)]/85 backdrop-blur-sm"
                              data-testid="design-loading"
                              role="status"
                              aria-live="polite"
                            >
                              <div className="flex flex-col items-center gap-3">
                                <Spinner
                                  size={28}
                                  className="text-[color:var(--text-strong)]"
                                />
                                <span className="text-[13px] text-[color:var(--text-soft)]">
                                  디자인을 불러오는 중…
                                </span>
                              </div>
                            </div>
                          )}

                          <main
                            className="absolute inset-0 overflow-hidden"
                            data-testid="design-canvas-host"
                            ref={canvasHostCallbackRef}
                            style={
                              peek.isActive
                                ? { perspective: "1800px", perspectiveOrigin: "50% 35%" }
                                : undefined
                            }
                          >
                            <div
                              data-peek-tilt-target
                              style={{
                                position: "absolute",
                                inset: 0,
                                transformStyle: "preserve-3d",
                                transform: peek.isActive ? "rotateX(12deg)" : "rotateX(0deg)",
                                transformOrigin: "50% 50%",
                              }}
                            >
                              <FrameStage
                                designWidth={design.width}
                                designHeight={design.height}
                                // WI-040 Phase 3 — host-supplied hover
                                // overlay. Lives inside FrameStage's
                                // design-plane so its rects share the
                                // camera transform. The Mount component
                                // uses the gate hook + projector;
                                // visibility filters + selection
                                // exclusion happen there.
                                renderHoverOverlay={() => (
                                  <HoverAffordanceMount
                                    doc={docInAgocraft}
                                    hoveredKind={hoverContext.hoveredKind}
                                    hoveredId={hoverContext.hoveredId}
                                    designWidth={design.width}
                                    designHeight={design.height}
                                    selectedIds={selectedIds}
                                  />
                                )}
                                background={design.background}
                                root={docInAgocraft.root}
                                document={docInAgocraft}
                                editor={editor}
                                editing={true}
                                infiniteCanvas={infiniteCanvas}
                                handMode={handMode}
                                // WI-033 P2 — enteredId / onEnter / onFitAll were
                                // the drill-in mode wiring (Phase 12); removed
                                // alongside the breadcrumb + Enter frame menu
                                // item. FrameStage falls back to "no entered
                                // frame" (undefined).
                                selectedId={selectedFrameId ?? undefined}
                                selectedIds={selectedIds}
                                dimmedFrameIds={dimmedFrameIds}
                                isolatedFrameIds={isolatedFrameIds}
                                onSelect={setSelectedFrameId}
                                onToggleSelect={(id) => toggleFrames([id])}
                                onMarqueeSelect={onMarqueeSelect}
                                // WI-035 P3 — Toolbar drag-to-add. The
                                // DropdownMenu add-items set the mime
                                // `application/x-weave-add-kind` on
                                // dragstart; FrameStage routes the drop's
                                // `containerId` (root or hovered frame).
                                // This handler dispatches the same
                                // `weave.item.add` SSOT.
                                onDragOver={(e) => {
                                  if (
                                    e.dataTransfer.types.includes("application/x-weave-add-kind")
                                  ) {
                                    e.preventDefault();
                                  }
                                }}
                                onDropAdd={(e, containerId) => {
                                  const kindRaw = e.dataTransfer.getData(
                                    "application/x-weave-add-kind",
                                  );
                                  if (kindRaw === "") return;
                                  e.preventDefault();
                                  const kind = kindRaw as DomainKind;
                                  editor.exec("weave.item.add", {
                                    kind,
                                    containerId,
                                    frame: {
                                      x: 0.3,
                                      y: 0.3,
                                      width: 0.4,
                                      height: 0.4,
                                      rotation: 0,
                                    },
                                  });
                                }}
                                onUpdateItem={(itemId, patcher) =>
                                  updateItem(itemId, (prev) => ({
                                    ...prev,
                                    attrs: patcher(
                                      prev.attrs as unknown as Record<string, unknown>,
                                    ) as never,
                                  }))
                                }
                                // WI-032 Phase 3b — onUpdateShape / onRemoveShape
                                // edited `canvas-design.attrs.shapes[]`; with that
                                // kind removed, shape primitives flow through
                                // `onUpdateItem` instead.
                                onCommitFrame={(itemId, nextFrame: ItemFrame) =>
                                  updateItem(itemId, (prev) => ({
                                    ...prev,
                                    attrs: { ...prev.attrs, frame: nextFrame } as typeof prev.attrs,
                                  }))
                                }
                                renderFrameMenu={(itemId, children, ctx) => {
                                  // WI-039 — selection-aware reparent. The
                                  // gesture moves either the right-clicked
                                  // frame OR the multi-selection it belongs
                                  // to; cycle-blocked rows are dimmed.
                                  const movedIds: ReadonlyArray<string> =
                                    selectedIds.has(itemId) && selectedIds.size > 1
                                      ? [...selectedIds]
                                      : [itemId];
                                  const reparentTree = buildFrameTree(docInAgocraft, movedIds);
                                  const handleReparent = (targetPickerId: string) => {
                                    const newParentId = resolvePickerTargetId(
                                      docInAgocraft,
                                      targetPickerId,
                                    );
                                    editor.exec("weave.item.reparent", {
                                      entries: movedIds.map((id) => ({
                                        itemId: id,
                                        newParentId,
                                      })),
                                    });
                                  };
                                  return (
                                    <FrameContextMenu
                                      itemId={itemId}
                                      onDelete={() => {
                                        removeItem(itemId);
                                        bumpHistoryTick();
                                      }}
                                      onZOrder={(dir) => {
                                        const cmdId = {
                                          bringForward: "weave.item.bringForward",
                                          sendBackward: "weave.item.sendBackward",
                                          bringToFront: "weave.item.bringToFront",
                                          sendToBack: "weave.item.sendToBack",
                                        }[dir];
                                        editor.exec(cmdId, { itemId });
                                      }}
                                      reparentTree={reparentTree}
                                      onReparent={handleReparent}
                                      onClipboard={(verb) =>
                                        dispatchEditorCommand(
                                          `weave.clipboard.${
                                            verb === "pasteSpecial" ? "pasteSpecial" : verb
                                          }`,
                                          { editor },
                                          commandContext,
                                        )
                                      }
                                      clipboardHasItems={clipboardCommands.hasItems}
                                      {...(ctx !== undefined
                                        ? {
                                            layers: ctx.layers,
                                            onPickLayer: ctx.onPickLayer,
                                          }
                                        : {})}
                                    >
                                      {children}
                                    </FrameContextMenu>
                                  );
                                }}
                              />
                            </div>

                            {/* WI-019 Phase 3 (rev2) — Peek mode capture layer + overlay.
                  The capture div sits z-above FrameStage and is mounted
                  ONLY while peek is active, intercepting pointer events
                  to (a) report cursor → controller, (b) handle drag-to-
                  reorder on lifted frames. PeekOverlay is responsible for
                  the CSS lift effect on the *real* frame DOM via data
                  attributes (no transparent placeholder boxes).            */}
                            {peek.isActive ? (
                              <div
                                data-testid="peek-capture"
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  zIndex: 30,
                                  cursor: peekDragRef.current ? "grabbing" : "crosshair",
                                }}
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  const p = screenToDesign(e.clientX, e.clientY);
                                  if (!p) return;
                                  const id = hitTestLifted(p.x, p.y);
                                  if (!id) return;
                                  const liftSet = peek.controller.liftSet.get();
                                  if (!liftSet) return;
                                  const startRank = liftSet.orderedIds.indexOf(id);
                                  if (startRank < 0) return;
                                  if (!peek.controller.startDrag(id)) return;
                                  peekDragRef.current = {
                                    itemId: id,
                                    startClientY: e.clientY,
                                    startRank,
                                    pointerId: e.pointerId,
                                  };
                                  setPeekDraggingId(id);
                                  // Mark the dragging frame for the stronger lifted style.
                                  const el = canvasHostRef.current?.querySelector(
                                    `[data-frame-id="${id}"]`,
                                  );
                                  if (el instanceof HTMLElement)
                                    el.setAttribute("data-peek-dragging", "");
                                  try {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                  } catch {
                                    /* setPointerCapture may throw on detached pointers — safe ignore. */
                                  }
                                }}
                                onPointerMove={(e) => {
                                  const p = screenToDesign(e.clientX, e.clientY);
                                  if (p) {
                                    peek.setCursor(p.x, p.y, true);
                                    setPeekCursor({
                                      x: e.clientX - (hostRect?.left ?? 0),
                                      y: e.clientY - (hostRect?.top ?? 0),
                                    });
                                  }
                                  // Drag preview — vertical pointer delta → rank delta.
                                  const drag = peekDragRef.current;
                                  if (drag) {
                                    const liftSet = peek.controller.liftSet.get();
                                    if (!liftSet) return;
                                    const dy = drag.startClientY - e.clientY;
                                    const STEP_PX = 28;
                                    const deltaRank = Math.round(dy / STEP_PX);
                                    const max = liftSet.orderedIds.length - 1;
                                    const newRank = Math.max(
                                      0,
                                      Math.min(max, drag.startRank + deltaRank),
                                    );
                                    peek.controller.updateDrag(newRank);
                                  }
                                }}
                                onPointerUp={(e) => {
                                  const drag = peekDragRef.current;
                                  if (drag) {
                                    peek.controller.endDrag(true);
                                    const el = canvasHostRef.current?.querySelector(
                                      `[data-frame-id="${drag.itemId}"]`,
                                    );
                                    if (el instanceof HTMLElement)
                                      el.removeAttribute("data-peek-dragging");
                                    peekDragRef.current = null;
                                    setPeekDraggingId(null);
                                    try {
                                      e.currentTarget.releasePointerCapture(e.pointerId);
                                    } catch {
                                      /* safe ignore */
                                    }
                                  }
                                }}
                                onPointerCancel={() => {
                                  const drag = peekDragRef.current;
                                  if (drag) {
                                    peek.controller.endDrag(false);
                                    const el = canvasHostRef.current?.querySelector(
                                      `[data-frame-id="${drag.itemId}"]`,
                                    );
                                    if (el instanceof HTMLElement)
                                      el.removeAttribute("data-peek-dragging");
                                    peekDragRef.current = null;
                                    setPeekDraggingId(null);
                                  }
                                }}
                                onPointerLeave={() => {
                                  peek.setCursor(-9999, -9999, false);
                                  setPeekCursor(null);
                                }}
                              >
                                <PeekOverlay
                                  controller={peek.controller}
                                  canvasHost={canvasHostEl}
                                  cursor={peekCursor}
                                  colorFor={swatchFor}
                                  draggingId={peekDraggingId}
                                />
                              </div>
                            ) : null}

                            {peek.isActive ? (
                              <PointStackInspector
                                controller={peek.controller}
                                labelFor={labelFor}
                                swatchFor={swatchFor}
                              />
                            ) : null}

                            {/* WI-020 / WI-021 / Phase 14 — ContextualToolbar mounts
                  centered above the canvas. Selection-only:
                    • selectedIds.size === 0 → bar unmounted.
                      design.background editor lives in the header's right
                      cluster (file-level chrome, always discoverable).
                    • selectedIds.size ≥ 1   → selection variant resolved
                      from the toolbar section registry per kind. */}
                            <SelectionChromeGate>
                              {typeof document !== "undefined" && createPortal(
                              <div
                                style={{
                                  // Portal'd to document.body for the same
                                  // reason as the header / ThumbnailPanel —
                                  // the outer `fixed inset-0` wrapper creates
                                  // a stacking context that traps any z-index
                                  // below body-portal'd SelectionLayer (40) /
                                  // MarqueeSelection (42) / RubberBand (45).
                                  // Hoisting to body lets the toolbar share
                                  // the header's z-tier and sit above
                                  // selection chrome.
                                  position: "fixed",
                                  // 48 (h-12 header) + 12 gap = 60 from top.
                                  top: 60,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  zIndex: 46,
                                  pointerEvents: "auto",
                                }}
                              >
                                <ContextualToolbar
                                  editor={editor}
                                  document={docInAgocraft}
                                  selectedItems={(() => {
                                    // Pre-existing bug fix — earlier this loop
                                    // only iterated `root.children`, so nested
                                    // items (anything below the first level)
                                    // never surfaced in `selectedItems` and
                                    // the toolbar simply didn't render for
                                    // them. Walk the full tree by resolving
                                    // each id via findItemDeep so any item in
                                    // the selection — root or nested — feeds
                                    // its kind + attrs into the toolbar.
                                    const out: Array<{
                                      id: string;
                                      kind: string;
                                      attrs: Readonly<Record<string, unknown>>;
                                    }> = [];
                                    for (const id of selectedIds) {
                                      const it = findItemDeep(docInAgocraft, id);
                                      if (it === undefined) continue;
                                      out.push({
                                        id: String(it.id),
                                        kind: it.kind,
                                        attrs: it.attrs,
                                      });
                                    }
                                    return out;
                                  })()}
                                  onEditMediaSrc={(mediaKind) => {
                                    setPendingMedia({ action: "edit", kind: mediaKind });
                                  }}
                                  onEditShapeFill={(mediaKind, current) => {
                                    if (!selectedFrameId) return;
                                    setPendingMedia({
                                      action: "fill",
                                      kind: mediaKind,
                                      itemId: selectedFrameId,
                                      initialSrc: current,
                                    });
                                  }}
                                />
                              </div>,
                              document.body)}
                            </SelectionChromeGate>

                            {/* WI-028 Phase 4 — remote cursors overlay. `project` maps the
                  presence-broadcast design-space coords to host-relative
                  pixels so the SVG renders aligned to the local user's
                  viewport. The SVG itself is pointer-events:none — it
                  never intercepts the design surface gestures. */}
                            {sync !== undefined ? (
                              <PresenceCursors engine={sync.engine} project={designToHost} />
                            ) : null}
                          </main>

                          {/* ThumbnailPanel floats at the bottom of the viewport
                          on top of the design canvas (z-stack). The panel's
                          own section uses `position: relative` to host its
                          shorter bg band; the wrapper here owns the
                          viewport-bottom anchoring + stack order.
                          Portal'd to document.body for the same reason as the
                          header above — the outer `fixed inset-0` wrapper
                          creates a stacking context that traps internal
                          z-index below the body-portal'd selection chrome
                          (SelectionLayer 40 / MarqueeSelection 42 / RubberBand
                          45). Hoisted to body so z-[46] competes with them
                          directly. */}
                          {typeof document !== "undefined" && createPortal(
                          <div className="fixed inset-x-0 bottom-0 z-[46]">
                            <ThumbnailPanel
                              design={design}
                              setPresentationOrder={setPresentationOrderViaEditor}
                              selectedId={selectedFrameId}
                              onSelect={setSelectedFrameId}
                              focusedId={focused?.id}
                              focusStage={focusStage}
                              disabledFrameIds={disabledFrameIds}
                              onCycleFocus={handleCycleFocus}
                              onClearFocus={handleClearFocus}
                            />
                          </div>,
                          document.body)}
                          <CursorTooltipBridge
                            hover={hoverContext}
                            selectedIds={selectedIds}
                            canUndo={canUndo}
                            canRedo={canRedo}
                            doc={docInAgocraft}
                            hotkeyTable={editorHotkeyTable}
                          />
                          <EditAffordanceGate>
                            <ReparentGhostOverlay state={reparentDragState} />
                          </EditAffordanceGate>
                          <MediaSrcDialog
                            open={pendingMedia !== null}
                            kind={pendingMedia?.kind ?? "image"}
                            initialSrc={(() => {
                              if (!pendingMedia) return "";
                              if (pendingMedia.action === "fill") return pendingMedia.initialSrc;
                              if (pendingMedia.action === "edit") {
                                if (!selectedFrameId) return "";
                                const it = docInAgocraft.root.children.find(
                                  (c) => String(c.id) === selectedFrameId,
                                );
                                if (!it || it.kind !== pendingMedia.kind) return "";
                                return (it.attrs as { src?: string }).src ?? "";
                              }
                              return "";
                            })()}
                            onConfirm={(src) => {
                              const pending = pendingMedia;
                              setPendingMedia(null);
                              if (!pending) return;
                              if (pending.action === "fill") {
                                // Replace the shape's fill with image/video paint. Default
                                // fit "cover" matches Figma. Video defaults muted+loop so
                                // the browser autoplay policy is satisfied.
                                editor.exec("weave.item.update", {
                                  itemId: pending.itemId,
                                  patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
                                    attrs: {
                                      ...prev.attrs,
                                      fill:
                                        pending.kind === "image"
                                          ? { type: "image", src, fit: "cover", opacity: 1 }
                                          : {
                                              type: "video",
                                              src,
                                              fit: "cover",
                                              muted: true,
                                              loop: true,
                                              opacity: 1,
                                            },
                                    } as unknown as Readonly<Record<string, unknown>>,
                                  }),
                                });
                                return;
                              }
                              if (pending.action === "edit") {
                                if (!selectedFrameId) return;
                                const it = docInAgocraft.root.children.find(
                                  (c) => String(c.id) === selectedFrameId,
                                );
                                if (it && it.kind === pending.kind) {
                                  editor.exec("weave.item.update", {
                                    itemId: selectedFrameId,
                                    patch: (prev: {
                                      attrs: Readonly<Record<string, unknown>>;
                                    }) => ({
                                      attrs: {
                                        ...prev.attrs,
                                        src,
                                      } as unknown as Readonly<Record<string, unknown>>,
                                    }),
                                  });
                                  return;
                                }
                                addNewItem(pending.kind, undefined, src);
                                return;
                              }
                              addNewItem(pending.kind, undefined, src);
                            }}
                            onCancel={() => setPendingMedia(null)}
                          />
                          {/* WI-041 Phase 6 — Paste Special dialog.
                              Cmd+Opt+V (or ContextMenu "선택하여
                              붙여넣기…") opens the dialog; on confirm
                              the host invokes `weave.clipboard.paste`
                              with the chosen mode and the current
                              selection. */}
                          <PasteSpecialDialog
                            open={clipboardCommands.pasteSpecialOpen}
                            onOpenChange={clipboardCommands.setPasteSpecialOpen}
                            onConfirm={clipboardCommands.handlePasteSpecialConfirm}
                            clipboardHasItems={clipboardCommands.hasItems}
                            hasSelection={selectedIds.size > 0}
                          />
                          {/* WI-030 — slide preset picker. Add menu →
                          "슬라이드…" opens this Dialog. Picking a
                          preset dispatches a single `weave.preset.insertSlide`
                          which stages the slide + child Items as one history
                          entry; Cmd+Z reverts the whole subtree. */}
                          <SlidePresetPicker
                            open={slidePickerOpen}
                            onOpenChange={setSlidePickerOpen}
                            onPick={(presetId) => {
                              const result = editor.exec<unknown, string>(
                                "weave.preset.insertSlide",
                                {
                                  presetId,
                                  containerId: String(docInAgocraft.root.id),
                                },
                              );
                              if (result.ok) {
                                setSelectedFrameIdRef.current?.(result.value);
                              }
                            }}
                          />
                          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
                          {/* WI-036 — QuickActionBar anchored to the hovered
                          frame's viewport top-left (8px gap above the
                          frame edge). The bar carries
                          `data-quick-actions-frame-id` so
                          useHoverContext can treat pointer-over-bar as a
                          continuation of the underlying frame's hover
                          (hover target union). Position follows the
                          frame via RAF while hover is active. */}
                          <MultiSelectionOverlay
                            selectedIds={selectedIds}
                            onResize={(updates) => {
                              // WI-036 follow-up — multi-selection resize.
                              // Dispatch a SINGLE `weave.items.resizeMulti`
                              // command that emits N patches in one Change,
                              // so the editor's history records the entire
                              // drag as ONE undoable step (per-frame
                              // updates would be N separate entries).
                              if (updates.length === 0) return;
                              editor.exec("weave.items.resizeMulti", {
                                updates: updates.map((u) => ({
                                  itemId: u.id,
                                  frame: u.frame,
                                })),
                              });
                            }}
                          />
                          <QuickActionBarAnchored
                            selectedFrameId={selectedFrameId ?? undefined}
                            selectedIds={selectedIds}
                            onInsertInFrame={(containerId, kind, sub) => {
                              // WI-036 follow-up — hover-open submenu of
                              // the `+` button. Shares the same
                              // `weave.item.add` SSOT as the hotkey /
                              // Alt+drag / DropdownMenu add paths.
                              //
                              // The bar is selection-driven: after the
                              // submenu inserts a child we deliberately
                              // KEEP the parent selected (don't follow
                              // the new item) so the bar stays anchored
                              // to the same frame and the user can add
                              // multiple children in a row.
                              const attrsOverride: Record<string, unknown> = {};
                              if (kind === "shape" && sub && sub !== "rectangle") {
                                attrsOverride.shape = sub;
                                attrsOverride.subAttrs = defaultShapeSubAttrs(sub);
                              }
                              editor.exec<unknown, string>("weave.item.add", {
                                kind,
                                containerId,
                                frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
                                ...(Object.keys(attrsOverride).length > 0 ? { attrsOverride } : {}),
                              });
                            }}
                          />
                        </div>
                      </DocumentForResolutionProvider>
                    </EditorProvider>
                  </ModeAwareTooltipSurface>
                </CommandHostProvider>
              </PeekActiveProvider>
            </InteractionModeProvider>
          </SelectionProvider>
        </SelectionChromeProvider>
      </RouterProvider>
    </EditorVMProvider>
  );
}

interface MultiSelectionOverlayProps {
  readonly selectedIds: ReadonlySet<string>;
  /** WI-036 follow-up — corner drag callback. Receives the new frame
   *  ratios (relative to each item's parent) computed by scaling the
   *  bounding box around the anchor corner. Fires repeatedly during
   *  drag and once on pointerup. The host applies them via a single
   *  `weave.item.update` per item with a shared mergeKey so history
   *  records the gesture as one undoable step. */
  readonly onResize: (
    updates: ReadonlyArray<{
      readonly id: string;
      readonly frame: { x: number; y: number; width: number; height: number };
    }>,
  ) => void;
}

/** WI-036 follow-up v2 — multi-selection bounding box overlay.
 *  When 2+ frames are selected, paints a dashed marquee enclosing
 *  every selected frame's viewport bounds plus 4 corner handles
 *  (visual placeholders; multi-frame resize is v1.x backlog). Each
 *  individual frame still mounts its own per-frame handle set
 *  (FrameStage.SelectionLayer), so the overlay is purely additive. */
function MultiSelectionOverlay({
  selectedIds,
  onResize,
}: MultiSelectionOverlayProps): React.ReactElement | null {
  const isMulti = selectedIds.size > 1;
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const idsKey = useMemo(
    () => (isMulti ? Array.from(selectedIds).sort().join("|") : ""),
    [isMulti, selectedIds],
  );
  useEffect(() => {
    if (!isMulti) {
      setBox(null);
      return;
    }
    let raf = 0;
    const tick = (): void => {
      let minL = Number.POSITIVE_INFINITY;
      let minT = Number.POSITIVE_INFINITY;
      let maxR = Number.NEGATIVE_INFINITY;
      let maxB = Number.NEGATIVE_INFINITY;
      let found = false;
      for (const id of selectedIds) {
        const el = document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`);
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.left < minL) minL = r.left;
        if (r.top < minT) minT = r.top;
        if (r.right > maxR) maxR = r.right;
        if (r.bottom > maxB) maxB = r.bottom;
        found = true;
      }
      if (!found) {
        setBox(null);
        return;
      }
      const next = {
        left: minL,
        top: minT,
        width: maxR - minL,
        height: maxB - minT,
      };
      setBox((prev) => {
        if (
          prev !== null &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        )
          return prev;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isMulti, selectedIds, idsKey]);

  if (box === null) return null;
  return (
    <div
      className="fixed pointer-events-none z-20"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        // WI-036 follow-up — explicit dashed marquee with a longer
        // stroke + gap so the dashing reads as 점선 rather than near-
        // solid. SVG dasharray would render most cleanly but a CSS
        // border with `dashed` style is good enough at v1.
        border: "2px dashed var(--accent)",
        boxSizing: "border-box",
      }}
      data-testid="multi-selection-overlay"
    >
      {(["nw", "ne", "sw", "se"] as const).map((corner) => {
        const cursor = corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
        return (
          // WI-036 follow-up — square handle (matches SelectionHandle's
          // kind="corner" 10×10 px). Offset -16 px so the handle sits
          // clearly OUTSIDE the bounding-box corner and never overlaps
          // the underlying frame's own single-frame corner handle (at
          // offset -5 px). Visible range: outer.NW -16 to outer.NW -6
          // (no overlap with inner.NW -5 to +5).
          //
          // pointerEvents: "auto" overrides the parent wrap's
          // `pointer-events: none`. pointerdown captures each item's
          // pre-drag viewport rect + parent rect, anchors the opposite
          // corner, and on every pointermove computes the new bounding
          // box → re-ratios each item's frame relative to its parent.
          // Updates fire via `onResize` which the host coalesces into
          // a single undoable history entry through mergeKey.
          <div
            key={corner}
            data-multi-corner={corner}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const ids = Array.from(selectedIds);
              const items: Array<{
                id: string;
                vp: DOMRect;
                parentVp: DOMRect;
              }> = [];
              for (const id of ids) {
                const el = document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`);
                if (!(el instanceof HTMLElement)) continue;
                const parentFrameEl = el.parentElement?.closest("[data-frame-id]") ?? null;
                const parentEl =
                  parentFrameEl ?? document.querySelector("[data-design-plane='true']");
                if (!(parentEl instanceof HTMLElement)) continue;
                items.push({
                  id,
                  vp: el.getBoundingClientRect(),
                  parentVp: parentEl.getBoundingClientRect(),
                });
              }
              if (items.length === 0) return;
              const initialBox = box;
              if (initialBox === null) return;
              const anchor = {
                x: corner.includes("w") ? initialBox.left + initialBox.width : initialBox.left,
                y: corner.includes("n") ? initialBox.top + initialBox.height : initialBox.top,
              };
              const target = e.currentTarget;
              const pointerId = e.pointerId;
              try {
                target.setPointerCapture(pointerId);
              } catch {
                // Ignore if capture is unavailable (test environments).
              }
              const onMove = (ev: PointerEvent): void => {
                const cur = { x: ev.clientX, y: ev.clientY };
                const newBox = {
                  left: Math.min(cur.x, anchor.x),
                  top: Math.min(cur.y, anchor.y),
                  width: Math.max(Math.abs(cur.x - anchor.x), 1),
                  height: Math.max(Math.abs(cur.y - anchor.y), 1),
                };
                const updates: Array<{
                  id: string;
                  frame: { x: number; y: number; width: number; height: number };
                }> = [];
                for (const it of items) {
                  const relX = (it.vp.left - initialBox.left) / initialBox.width;
                  const relY = (it.vp.top - initialBox.top) / initialBox.height;
                  const relW = it.vp.width / initialBox.width;
                  const relH = it.vp.height / initialBox.height;
                  const newL = newBox.left + relX * newBox.width;
                  const newT = newBox.top + relY * newBox.height;
                  const newW = relW * newBox.width;
                  const newH = relH * newBox.height;
                  updates.push({
                    id: it.id,
                    frame: {
                      x: (newL - it.parentVp.left) / it.parentVp.width,
                      y: (newT - it.parentVp.top) / it.parentVp.height,
                      width: newW / it.parentVp.width,
                      height: newH / it.parentVp.height,
                    },
                  });
                }
                onResize(updates);
              };
              const onUp = (): void => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
                try {
                  target.releasePointerCapture(pointerId);
                } catch {
                  // Ignore.
                }
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
              window.addEventListener("pointercancel", onUp);
            }}
            style={{
              position: "absolute",
              width: 10,
              height: 10,
              background: "#ffffff",
              border: "1.5px solid var(--accent)",
              borderRadius: 0,
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18)",
              boxSizing: "border-box",
              pointerEvents: "auto",
              cursor,
              ...(corner.includes("n") ? { top: -16 } : { bottom: -16 }),
              ...(corner.includes("w") ? { left: -16 } : { right: -16 }),
            }}
          />
        );
      })}
    </div>
  );
}

/** WI-040 — chrome visibility gate for affordances that should track
 *  `useSelectionChromeVisible` (idle / frame-manipulating / text-editing,
 *  with peek hidden). Lives as a separate component so the hook reads
 *  the InteractionMode + PeekActive contexts that wrap the DesignPage
 *  return tree — DesignPage's main body sits OUTSIDE those providers,
 *  so calling the hook there would return the no-op fallback. */
function SelectionChromeGate({ children }: { readonly children: ReactNodeAlias }): ReactNodeAlias {
  const visible = useSelectionChromeVisible();
  if (!visible) return null;
  return <>{children}</>;
}

/** WI-040 — strictly idle gate for short-lived affordances that should
 *  vanish the moment another mode owns the canvas: ReparentGhostOverlay
 *  chip, future HoverAffordanceLayer. Same provider-scope rationale as
 *  `SelectionChromeGate`. */
function EditAffordanceGate({ children }: { readonly children: ReactNodeAlias }): ReactNodeAlias {
  const allowed = useEditAffordancesAllowed();
  if (!allowed) return null;
  return <>{children}</>;
}

interface HoverAffordanceMountProps {
  readonly doc: AgocraftDocument;
  readonly hoveredKind: string;
  readonly hoveredId: string | undefined;
  readonly designWidth: number;
  readonly designHeight: number;
  readonly selectedIds: ReadonlySet<string>;
}

/** WI-040 Phase 3 — design-plane resident hover overlay. Lives inside
 *  the providers (FrameStage renders it via `renderHoverOverlay` slot
 *  inside the camera-transformed design-plane subtree). The
 *  `useEditAffordancesAllowed` gate handles peek + non-idle modes; the
 *  projector handles selection exclusion. */
function HoverAffordanceMount({
  doc,
  hoveredKind,
  hoveredId,
  designWidth,
  designHeight,
  selectedIds,
}: HoverAffordanceMountProps): ReactNodeAlias {
  const allowed = useEditAffordancesAllowed();
  const projection = useMemo(
    () =>
      projectHoverAffordance({
        doc,
        hoveredKind,
        hoveredId,
        designWidth,
        designHeight,
        selectedIds,
      }),
    [doc, hoveredKind, hoveredId, designWidth, designHeight, selectedIds],
  );
  if (!allowed) return null;
  return (
    <HoverAffordanceLayer
      visible={true}
      hovered={projection.hovered}
      descendants={projection.descendants}
      parent={projection.parent}
    />
  );
}

interface QuickActionBarAnchoredProps {
  /** WI-036 follow-up — selection-driven QuickActionBar. The bar
   *  mounts when a frame is selected (not when one is hovered), so
   *  it stays put while the user moves the mouse to the submenu or
   *  off the canvas. Undefined → no bar. */
  readonly selectedFrameId: string | undefined;
  /** Multi-selection — every id renders a selected outline. When
   *  `size > 1` the bar's anchor switches to the bounding box of the
   *  selected items, and `selectedKind === "multi"` (set by the host
   *  in commandContext) surfaces the `multi.*` command set. */
  readonly selectedIds: ReadonlySet<string>;
  /** Host-owned insert dispatch. The `+` button's hover submenu
   *  lists every domain × sub-kind add and dispatches through this
   *  callback (which routes the same `weave.item.add` SSOT all other
   *  paths use). Receives the container frame id from the anchored
   *  bar's current target. */
  readonly onInsertInFrame: (
    containerId: string,
    kind: DomainKind,
    shapeSubKind?: ShapeSubKind,
  ) => void;
}

function QuickActionBarAnchored({
  selectedFrameId,
  selectedIds,
  onInsertInFrame,
}: QuickActionBarAnchoredProps): React.ReactElement | null {
  // WI-040 — affordance gate. The QuickActionBar is a hover/selection
  // affordance and must stand down whenever something else owns the
  // canvas: peek inspector active, context-menu (LayerPicker) open,
  // hand/pan armed, rubber-band drawing, text editing in flight, or a
  // frame mid-drag. `useEditAffordancesAllowed` is the single-source
  // boolean for this — same gate the upcoming HoverAffordanceLayer
  // (Phase 3) will share.
  const affordancesAllowed = useEditAffordancesAllowed();
  const isMulti = selectedIds.size > 1;
  const [anchor, setAnchor] = useState<{ top: number; left: number; frameId: string } | null>(null);
  // Stable key for the multi-select case so the effect re-mounts
  // whenever the selection set changes (sorted ids joined).
  const multiKey = useMemo(
    () => (isMulti ? Array.from(selectedIds).sort().join("|") : ""),
    [isMulti, selectedIds],
  );
  useEffect(() => {
    const ids = isMulti
      ? Array.from(selectedIds)
      : selectedFrameId !== undefined
        ? [selectedFrameId]
        : [];
    if (ids.length === 0) {
      setAnchor(null);
      return;
    }
    let raf = 0;
    const tick = (): void => {
      let minLeft = Number.POSITIVE_INFINITY;
      let minTop = Number.POSITIVE_INFINITY;
      let found = false;
      for (const id of ids) {
        const el = document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`);
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.left < minLeft) minLeft = r.left;
        if (r.top < minTop) minTop = r.top;
        found = true;
      }
      if (!found) {
        // Every selected frame was deleted — clear the anchor and
        // stop polling. A fresh selection restarts this effect.
        setAnchor(null);
        return;
      }
      const nextTop = minTop - 40;
      const nextLeft = minLeft;
      // `frameId` is repurposed for the data-attribute payload — for
      // a multi-selection we expose the primary id (first selected)
      // so the bar still routes single-frame commands through
      // commandContext.selectedId.
      const tagId = isMulti ? (ids[0] ?? "multi") : ids[0]!;
      setAnchor((prev) => {
        if (
          prev !== null &&
          prev.frameId === tagId &&
          Math.abs(prev.top - nextTop) < 0.5 &&
          Math.abs(prev.left - nextLeft) < 0.5
        )
          return prev;
        return { top: nextTop, left: nextLeft, frameId: tagId };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedFrameId, isMulti, selectedIds, multiKey]);

  if (!affordancesAllowed) return null;
  if (anchor === null) return null;
  // The outer wrap carries an invisible 12px padding so the bar's
  // hover hit-area extends past the visible bar boundary into the
  // gap above the frame edge. Without this, a mouse that crosses
  // from the frame to the bar on a near-pixel-perfect trajectory
  // briefly lands on neither surface and the hover state collapses
  // before the grace period can absorb it.
  return (
    <div
      className="fixed z-30 p-3"
      style={{ top: anchor.top - 12, left: anchor.left - 12 }}
      data-quick-actions-frame-id={anchor.frameId}
    >
      <QuickActionBar
        data-testid="hover-quick-actions"
        // 8 multi-selection align/distribute commands stay registered
        // (so their Alt+letter hotkeys + command palette entries keep
        // working) but are HIDDEN from the bar — one `multi.align`
        // submenu button surfaces them instead. Single-frame bar
        // currently shows up to 5 items; multi-bar shows 2 (align
        // trigger + delete). 8 leaves headroom for future single-
        // frame additions before another submenu is needed.
        maxItems={8}
        excludeIds={MULTI_ALIGN_INDIVIDUAL_IDS}
        // Pin destructive ✕ to the rightmost slot regardless of
        // registry order. Both single-frame and multi-selection deletes
        // are pinned so the user can always reach for the right edge
        // to remove the selection.
        pinToEndIds={DELETE_PIN_IDS}
        renderItem={(id) => {
          // WI-036 follow-up — the `+` button doubles as a hover-
          // open submenu listing every add option (frame / text /
          // 9 shape variants). Single-click dispatches the default
          // (a child frame, matching the original `frame.addChild`);
          // hover opens the submenu so the user can pick any kind
          // without learning a separate path.
          if (id === "frame.addChild") {
            return <FrameAddSubmenu frameId={anchor.frameId} onInsert={onInsertInFrame} />;
          }
          // Single `multi.align` button on the bar opens a submenu
          // containing every align/distribute op (the 8 individual
          // ids are filtered out via `excludeIds` above so they don't
          // also surface inline). Same hover-open pattern as
          // FrameAddSubmenu.
          if (id === "multi.align") {
            return <MultiAlignSubmenu />;
          }
          const glyph =
            id === "frame.delete" || id === "multi.delete"
              ? "✕"
              : id === "image.replaceSrc" || id === "video.replaceSrc"
                ? "↻"
                : "•";
          return (
            <CommandIconButton commandId={id} size="sm">
              <span className="text-[13px]">{glyph}</span>
            </CommandIconButton>
          );
        }}
      />
    </div>
  );
}

// Multi-selection align / distribute submenu — a single button on the
// QuickActionBar that opens a dropdown listing every align op. Mirrors
// FrameAddSubmenu's hover-open pattern: the trigger is itself a
// dispatchable CommandIconButton (`multi.align`, registered with a
// no-op action so the click does nothing without the dropdown — the
// dropdown trigger captures the open intent), and the dropdown body
// holds the 8 individual align/distribute commands as DropdownMenuItems.
//
// Each row dispatches its command via `host.dispatch(id)` — the same
// path the Alt+letter hotkeys use — so the host's `multiAligner` slot
// runs and the operation lands as a single undoable Change.
function MultiAlignSubmenu(): React.ReactElement {
  const host = useCommandHost();
  const [open, setOpen] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const cancelLeave = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelLeave();
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setOpen(false);
    }, 200);
  }, [cancelLeave]);
  const handleEnter = useCallback(() => {
    cancelLeave();
    setOpen(true);
  }, [cancelLeave]);
  useEffect(() => {
    return () => cancelLeave();
  }, [cancelLeave]);

  // Resolve enabled state through the same registry the bar uses, so
  // the rows match the trigger's greyed-out behavior on cross-parent
  // selections AND each row's own `enabledWhen` predicate (distribute
  // requires ≥ 3, align only needs ≥ 2) is honored without the host
  // re-implementing the rules.
  const isEntryEnabled = useCallback(
    (id: string): boolean => host.registry.isEnabled(id, host.context),
    [host],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <span onMouseEnter={handleEnter} onMouseLeave={scheduleClose}>
        <DropdownMenuTrigger asChild>
          <CommandIconButton commandId="multi.align" size="sm">
            <IconAlignHorizontalCenter size={14} />
          </CommandIconButton>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleClose}
        data-testid="multi-align-submenu"
      >
        {MULTI_ALIGN_MENU_ENTRIES.map((entry, idx) => {
          const enabled = isEntryEnabled(entry.id);
          const row = (
            <DropdownMenuItem
              key={entry.id}
              disabled={!enabled}
              onSelect={() => {
                if (!enabled) return;
                host.dispatch(entry.id);
                setOpen(false);
              }}
              data-testid={`multi-align-row-${entry.id}`}
            >
              <span className="inline-flex items-center gap-2">
                <entry.Icon size={14} />
                <span>{entry.label}</span>
              </span>
            </DropdownMenuItem>
          );
          if (entry.group === "start" && idx > 0) {
            return (
              <React.Fragment key={`${entry.id}-grp`}>
                <DropdownMenuSeparator />
                {row}
              </React.Fragment>
            );
          }
          return row;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FrameAddSubmenuProps {
  readonly frameId: string;
  readonly onInsert: (containerId: string, kind: DomainKind, shapeSubKind?: ShapeSubKind) => void;
}

function FrameAddSubmenu({ frameId, onInsert }: FrameAddSubmenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const cancelLeave = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelLeave();
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setOpen(false);
    }, 200);
  }, [cancelLeave]);
  const handleEnter = useCallback(() => {
    cancelLeave();
    setOpen(true);
  }, [cancelLeave]);
  useEffect(() => {
    return () => cancelLeave();
  }, [cancelLeave]);

  const insertHandler = (kind: DomainKind, sub?: ShapeSubKind) => () => {
    onInsert(frameId, kind, sub);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <span onMouseEnter={handleEnter} onMouseLeave={scheduleClose}>
        <DropdownMenuTrigger asChild>
          <CommandIconButton commandId="frame.addChild" size="sm">
            <span className="text-[13px]">+</span>
          </CommandIconButton>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleClose}
        data-testid="frame-add-submenu"
      >
        <DropdownMenuLabel>프레임</DropdownMenuLabel>
        <DropdownMenuItem onSelect={insertHandler("frame")} data-testid="frame-add-frame">
          ▢&nbsp;&nbsp;프레임
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>텍스트</DropdownMenuLabel>
        <DropdownMenuItem onSelect={insertHandler("text")} data-testid="frame-add-text">
          T&nbsp;&nbsp;텍스트
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>도형</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={insertHandler("shape", "rectangle")}
          data-testid="frame-add-shape-rectangle"
        >
          ▭&nbsp;&nbsp;사각형
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "ellipse")}>
          ◯&nbsp;&nbsp;원
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "line")}>
          ─&nbsp;&nbsp;선
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "arrow")}>
          →&nbsp;&nbsp;화살표
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "triangle")}>
          △&nbsp;&nbsp;삼각형
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "star")}>
          ★&nbsp;&nbsp;별
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "polygon")}>
          ⬡&nbsp;&nbsp;다각형
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "heart")}>
          ♥&nbsp;&nbsp;하트
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={insertHandler("shape", "speech-bubble")}>
          💬&nbsp;&nbsp;말풍선
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
