import {
  type Document as AgocraftDocument,
  canBreakShapeToLine,
  canCloseLineToShape,
  createAutoFlexSpec,
  createAutoGridSpec,
  defaultShapeSubAttrs,
  FILL_UNIT_KIND,
  type LayoutSpec,
  type SerializedItem,
  type ShapeSubKind,
  trackFr,
} from "@agocraft/core";
import { EditorProvider } from "@agocraft/editor/react";
import {
  Banner,
  CommandHostProvider,
  CommandIconButton,
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HoverAffordanceLayer,
  IconAlignBottom,
  IconAlignHorizontalCenter,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconAlignVerticalCenter,
  IconCheck,
  IconClose,
  IconCopy,
  IconDistributeHorizontal,
  IconDistributeVertical,
  IconFrame,
  IconImage,
  IconLayers,
  IconLayoutAbsolute,
  IconLayoutFlex,
  IconLayoutGrid,
  IconLock,
  IconLockOpen,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconShape,
  IconShapeArrow,
  IconShapeEllipse,
  IconShapeHeart,
  IconShapeLine,
  IconShapePoly,
  IconShapePolygon,
  IconShapeRectangle,
  IconShapeSpeechBubble,
  IconShapeStar,
  IconShapeTriangle,
  IconText,
  IconUngroup,
  IconVideo,
  QuickActionBar,
  Spinner,
  UnifiedTooltip,
  useCommandHost,
} from "@weave/design-system";
import type { ReactNode as ReactNodeAlias } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  type DocFlavor,
  type DomainKind,
  effectiveDeckOrder,
  FLAVOR_REGISTRY,
  firstChildOf,
  InteractionModeProvider,
  type ItemFrame,
  isItemLocked,
  nextSiblingOf,
  PeekActiveProvider,
  parentOf,
  prevSiblingOf,
  SelectionProvider,
  useDesign,
  useEditAffordancesAllowed,
  useInteractionMode,
  useSelection,
  useTooltipsAllowed,
} from "../document";
import { computeAddFrame } from "../document/add-geometry.js";
import {
  absoluteFrameBox,
  findItemDeep,
  findParentAndIndex,
  isDomainItem,
} from "../document/agocraft-mirror.js";
import { clipboardStore } from "../document/clipboard/clipboard-store.js";
import { osMarkerRoutingActive } from "../document/clipboard/os-clipboard-marker.js";
import { useClipboardCommands } from "../document/clipboard/use-clipboard-commands.js";
import { pushDesignPatchesCloud } from "../document/cloud-sync.js";
import {
  basisFromFrameSample,
  basisFromLetterbox,
  clientToDesign,
  designToHostPx,
  type RatioFrame,
} from "../document/coordinate-projection.js";
import { EditorModeProvider } from "../document/editor-mode/EditorModeProvider.js";
// WI-166 / DR-114 §2b — DesignPage is a declared COMPOSITION ROOT
// (.editor-mode-roots): the registry import is allowed here and only here;
// every consumer below receives policies by injection (props / arguments).
import { editorModeFor } from "../document/editor-mode/registry.js";
import { capabilityOf, type ItemCapabilities } from "../document/editor-mode/types.js";
import { useExportImport } from "../document/export-import/use-export-import.js";
import {
  croppingState,
  isCroppingNow,
  useIsCropping,
} from "../document/interactions/cropping-state.js";

// Default text line-height multiplier (mirrors the TextAttrs seed default).
import { EditorVMProvider } from "../document/interactions/editor-vm-context.js";
import { frameHoverStore } from "../document/interactions/frame-hover-store.js";
import {
  buildFrameTree,
  type FrameTreeNode,
  resolvePickerTargetId,
} from "../document/interactions/frame-tree.js";
import { ReparentGhostOverlay } from "../document/interactions/ReparentGhostOverlay.js";
import { RouterProvider } from "../document/interactions/router-context.js";
import { SelectionChromeProvider } from "../document/interactions/selection-chrome-context.js";
import { textEditTrigger } from "../document/interactions/text-edit-trigger.js";
import { useHoverContext } from "../document/interactions/use-hover-context.js";
import { useLayoutChildDragController } from "../document/interactions/use-layout-child-drag-controller.js";
import { useReparentDragController } from "../document/interactions/use-reparent-drag-controller.js";
import { type LayerHit, LayerPickerMenu } from "../document/layer-picker/index.js";
import { MigrationResultBanner } from "../document/MigrationResultBanner.js";
import { computeAlignedFrames } from "../document/multi/align-ops.js";
import { type ArrangeLayout, computeArrangedFrames } from "../document/multi/layout-arrange.js";
import { PresenceCursors } from "../document/presence/PresenceCursors.js";
import { usePresenceLocalCursor } from "../document/presence/use-presence-local-cursor.js";
import { projectHoverAffordance } from "../document/render/hover-affordance-projector.js";
// WI-070 — import for its registration side effect: registers the endpoint→
// opposite-endpoint snap provider into SNAP_PROVIDERS (the host wires providers).
import "../document/selection-chrome/endpoint-snap-provider.js";
import { DatasetProvider } from "../document/dataset/dataset-context.js";
import { type DatasetPayload, setCell, setCells } from "../document/dataset/dataset-store.js";
import { ChartElementSelectionProvider } from "../document/domains/chart/chart-element-context.js";
import { chartElementStore } from "../document/domains/chart/chart-element-store.js";
import type { ChartLabelRef } from "../document/domains/chart/chart-label-sync.js";
import {
  type ChartEncoding,
  categoryField,
  migrateEncoding,
} from "../document/domains/chart/chart-model.js";
import { useChartLabelSync } from "../document/domains/chart/use-chart-label-sync.js";
import { useEmbedMetaSync } from "../document/embed/use-embed-meta-sync.js";
import { RotationSnapLayer } from "../document/selection-chrome/RotationSnapLayer.js";
import { SnapFeedbackLayer } from "../document/selection-chrome/SnapFeedbackLayer.js";
import { removeVertexAndRefit } from "../document/selection-chrome/vertex-ops.js";
import { vertexSelection } from "../document/selection-chrome/vertex-selection.js";
import {
  DesignDimsProvider,
  DocumentForResolutionProvider,
} from "../document/style/resolver-context.js";
import { CursorTooltipBridge } from "../document/tooltip/CursorTooltipBridge.js";
import {
  dispatchEditorCommand,
  editorCommandMetadata,
  type MultiAlignOp,
  type SelectionNavDir,
  setDesignSaver,
  setFrameDeleter,
  setFrameDissolver,
  setFrameDuplicator,
  setFrameSlideToggler,
  setHoverFrameChildAdder,
  setItemDuplicator,
  setLockToggler,
  setMediaSrcOpener,
  setMultiAligner,
  setMultiDeleter,
  setMultiLayoutArranger,
  setSelectionNavigator,
  setZOrderDispatcher,
  useEditorHotkeys,
  type ZOrderDir,
} from "../document/tooltip/editor-hotkeys.js";
import { useMigrateInlineMedia } from "../document/use-migrate-inline-media.js";
import { useWeaveEditor } from "../document/use-weave-editor.js";
import { AkuAssistant } from "../features/aku/AkuAssistant.js";
import { FigmaSelectionLaunchBanner } from "../launch/FigmaSelectionLaunchBanner.js";
import { TextV1LaunchBanner } from "../launch/TextV1LaunchBanner.js";
import { nn } from "../lib/nn.js";
import { useActivePage } from "./design/hooks/use-active-page.js";
import { useDesignCommandHost } from "./design/hooks/use-command-host.js";
import { useDesignPeek } from "./design/hooks/use-design-peek.js";
import { useDesignSave } from "./design/hooks/use-design-save.js";
import { useFrameFocus } from "./design/hooks/use-frame-focus.js";
import { useHandTool } from "./design/hooks/use-hand-tool.js";
import { useItemAdd } from "./design/hooks/use-item-add.js";
import { useOsPasteRouting } from "./design/hooks/use-os-paste-routing.js";
import { useSelectionChromeRegistry } from "./design/hooks/use-selection-chrome-registry.js";
import {
  LINE_CURVE,
  LINE_CURVE_FREE,
  LINE_FREE,
  LINE_STRAIGHT,
  type LineSeed,
} from "./design/line-seeds.js";
import { DesignDialogs } from "./design/view/DesignDialogs.js";
import { DesignHeader } from "./design/view/DesignHeader.js";
import { PeekCaptureLayer } from "./design/view/PeekCaptureLayer.js";
import { SelectionToolbarOverlay } from "./design/view/SelectionToolbarOverlay.js";
import { type FrameMenuContext, FrameStage } from "./FrameStage.js";
import { cameraFitBox } from "./frame-camera-bridge.js";
import { ThumbnailPanel } from "./ThumbnailPanel.js";

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
  onDuplicate,
  onGroup,
  onUngroup,
  onToggleLock,
  locked,
  children,
  layers,
  onPickLayer,
  onHoverPreview,
  onBreakToLine,
  onCloseToShape,
}: {
  readonly itemId: string;
  readonly onDelete: () => void;
  /** WI-065 / DR-031 — present when the right-clicked item is a CLOSED shape
   *  with a breakable outline → "선으로 끊기" (breaks at the first vertex). */
  readonly onBreakToLine?: () => void;
  /** WI-065 / DR-031 — present when the right-clicked item is an open line /
   *  free-curve → "끝점 이어 도형으로" (fuse endpoints into a closed shape). */
  readonly onCloseToShape?: () => void;
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
  /** WI-185 ⑮ — standard element-menu rows (Figma/office parity).
   *  Duplicate clones the selection-aware id set (⌘D rhythm-aware). */
  readonly onDuplicate?: () => void;
  /** WI-185 ⑮ — present when ≥2 groupable siblings are in play → "그룹". */
  readonly onGroup?: () => void;
  /** WI-185 ⑮ — present when the clicked item is a dissolvable frame. */
  readonly onUngroup?: () => void;
  /** WI-185 ⑮ — lock/unlock toggle; `locked` picks the row label. */
  readonly onToggleLock?: () => void;
  readonly locked?: boolean;
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
              layers={nn(layers)}
              onPickLayer={nn(onPickLayer)}
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
        {onDuplicate !== undefined && (
          <>
            <ContextMenuItem onSelect={onDuplicate} shortcut="⌘ D" data-testid="ctx-duplicate">
              복제
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
        {(onGroup !== undefined || onUngroup !== undefined || onToggleLock !== undefined) && (
          <>
            {onGroup !== undefined && (
              <ContextMenuItem onSelect={onGroup} shortcut="⌘ G" data-testid="ctx-group">
                그룹
              </ContextMenuItem>
            )}
            {onUngroup !== undefined && (
              <ContextMenuItem onSelect={onUngroup} shortcut="⌘ ⇧ G" data-testid="ctx-ungroup">
                그룹 해제
              </ContextMenuItem>
            )}
            {onToggleLock !== undefined && (
              <ContextMenuItem onSelect={onToggleLock} data-testid="ctx-lock">
                {locked === true ? "잠금 해제" : "잠금"}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}
        {(onBreakToLine !== undefined || onCloseToShape !== undefined) && (
          <>
            {onBreakToLine !== undefined && (
              <ContextMenuItem onSelect={onBreakToLine} data-testid="ctx-break-to-line">
                선으로 끊기
              </ContextMenuItem>
            )}
            {onCloseToShape !== undefined && (
              <ContextMenuItem onSelect={onCloseToShape} data-testid="ctx-close-to-shape">
                끝점 이어 도형으로
              </ContextMenuItem>
            )}
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

/** WI-185 ⑯ — empty-slide (page/stage) context menu. Pages are fixed
 *  editing contexts (WI-163), so the element menu's structural verbs
 *  (delete / z-order / move-to / group) make no sense on them — office
 *  tools converge on exactly three: Paste · New slide · 배경. Same
 *  interaction-mode wiring as FrameContextMenu so rubber-band / tooltips
 *  stand down while open. */
function PageContextMenu({
  itemId,
  pageNoun,
  onPaste,
  pasteEnabled,
  onNewPage,
  onEditBackground,
  children,
}: {
  readonly itemId: string;
  /** Flavor's page-unit noun — "슬라이드" (slide-deck) / "페이지" (doc-page). */
  readonly pageNoun: string;
  readonly onPaste: () => void;
  readonly pasteEnabled: boolean;
  readonly onNewPage: () => void;
  readonly onEditBackground: () => void;
  readonly children: ReactNodeAlias;
}) {
  const { setMode, restoreIdleFrom } = useInteractionMode();
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
        <ContextMenuItem
          onSelect={onPaste}
          shortcut="⌘ V"
          disabled={!pasteEnabled}
          data-testid="page-ctx-paste"
        >
          붙여넣기
        </ContextMenuItem>
        <ContextMenuItem onSelect={onNewPage} data-testid="page-ctx-new-page">
          새 {pageNoun}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onEditBackground} data-testid="page-ctx-background">
          배경 변경
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

export function DesignPage() {
  const { id } = useParams<{ id: string }>();
  // Key on the design id so navigating directly between designs (e.g. after
  // saving an offline edit as a NEW design) remounts the editor with fresh
  // state — React Router reuses the route element on param change, which
  // would otherwise leave the previous design's hooks (and the reconcile
  // dialog) mounted.
  return <DesignPageBody key={id ?? ""} />;
}

function DesignPageBody() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const designId = params.id ?? "";

  const {
    design,
    docInAgocraft,
    // WI-156 / DR-112 — `rawUpdateItem` is kept only for its `typeof` below; all
    // UI mutations route through `editor.exec`, never these direct setters.
    updateItem: rawUpdateItem,
    reset: rawReset,
    applyChange,
    replaceDocument,
    reconcileDerived,
    persistNow,
    persistNowAwaitable,
    isLoading,
    localConflict,
    resolveLocalConflict,
  } = useDesign(designId);
  const { editor, vm, router, selectionChrome, sync } = useWeaveEditor({
    docInAgocraft,
    // WI-156 / DR-112 — `reset` is the only host hook commands may reach (the
    // sole snapshot boundary); every other mutation is patch-borne via exec.
    commandTargets: {
      reset: rawReset,
    },
    applyChange,
    persist: persistNow,
    // WI-161 — delta persistence: the debounced save sends only changed
    // patches to /api/designs/:id/patches; `pushSnapshot` (full-PUT, also the
    // conflict/compaction fallback) is the awaitable full save. Robust fallback
    // keeps this safe even where the endpoint is absent (degrades to full-PUT).
    deltaTransport: {
      pushPatches: (serialized, baseCount) =>
        pushDesignPatchesCloud(designId, serialized, baseCount),
      pushSnapshot: persistNowAwaitable,
    },
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
  const _reorderRootChildrenViaEditor = useCallback(
    (order: ReadonlyArray<string>) => {
      editor.exec("weave.design.reorderChildren", { order });
    },
    [editor],
  );

  // Live-document mirror — shared by the selection-chrome VMs, peek, the z-order
  // adapter, and ~dozen orchestrator closures so they read current attrs without
  // re-subscribing. Hoisted (DR-027 / WI-071) above the hooks that consume it.
  const docInAgocraftRef = useRef<typeof docInAgocraft>(docInAgocraft);
  docInAgocraftRef.current = docInAgocraft;

  // DR-027 / WI-071 Phase 2 — DR-023 selection-chrome view-model registry (slide
  // bullet / default / text / shape / poly+line vertex) + WI-019 z-order adapter
  // extracted to a cooperating hook. selectFrameRef is owned there and assigned
  // below once useSelection is up.
  const { selectFrameRef } = useSelectionChromeRegistry({
    selectionChrome,
    editor,
    docRef: docInAgocraftRef,
  });

  // DR-027 / WI-071 Phase 2 — Peek mode controller + permutation-merge reorder
  // extracted to a cooperating view-model hook. The container id is driven by
  // the selection effect further down via the returned `setPeekContainerId`
  // (selection state doesn't exist yet at this call site).
  const { peek, setPeekContainerId } = useDesignPeek({
    design,
    editor,
    getDocument: () => docInAgocraftRef.current ?? null,
  });

  // Bounding rect ref for the canvas host — used to translate clientX/Y to
  // design-space coords. The math assumes the design plane is fit-scaled
  // (uniform scale, letterboxed) inside `main`. User camera zoom is not
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
    // DOM sampling (View concern) stays here; the scale/origin math is
    // delegated to the pure `coordinate-projection` module (WI-063 F-1a).
    const frameBasis = sampleFrameBasis();
    if (frameBasis) return clientToDesign(frameBasis, clientX, clientY);
    // Fallback: naive letterbox math (used only when no frames exist).
    if (!hostRect) return null;
    const basis = basisFromLetterbox(hostRect, design);
    return basis ? clientToDesign(basis, clientX, clientY) : null;
  }

  /** DOM-sampling glue: find a rendered `[data-frame-id]` element, read its
   *  measured rect + design-space frame, and hand both to the pure
   *  projection module. Returns null when no frame is rendered yet (caller
   *  falls back to letterbox). Shared by `screenToDesign` / `designToHost`. */
  function sampleFrameBasis() {
    const host = canvasHostRef.current;
    if (!host) return null;
    const sample =
      host.querySelector("[data-frame-id]:not([data-peek-lifted])") ??
      host.querySelector("[data-frame-id]");
    if (!(sample instanceof HTMLElement)) return null;
    const id = sample.getAttribute("data-frame-id");
    const item = id ? docInAgocraft.root.children.find((c) => String(c.id) === id) : undefined;
    const frame = item ? (item.attrs as { frame?: RatioFrame }).frame : undefined;
    if (!frame) return null;
    return basisFromFrameSample(sample.getBoundingClientRect(), frame, design);
  }

  // Item-add placement rule. Returns the new item's frame (ratio of its
  // parent) plus, for text, the font that fills the box height.
  //
  //   • Root add → centred in the CURRENT viewport (independent of pan /
  //     zoom) at 40% per axis (text: 30% tall). `screenToDesign` backs the
  //     live camera out of a rendered frame, so the viewport's centre +
  //     corners convert straight to design-root ratios. Parent height for
  //     the font ratio is the design height.
  //   • Frame add → centred inside the frame at 40% (text: 30% of the
  //     frame's height). The frame is brought full-screen afterwards, so a
  //     fixed frame-relative fraction reads as the same on-screen size.
  //     Parent height for the font ratio is the frame's absolute height.
  //
  // Text: the box height is set to EXACTLY one line of the chosen font
  // (rounded fontSize × lineHeight) so the height tracks the font, and the
  // font is stored as `fontSizeSpec { kind:"ratio" }` (ratio of the parent
  // height — the model the user chose; resolved back to px at render by
  // resolveFontSize) alongside the derived px legacy mirror. `fontSizeRatio`
  // below is just the computed ratio value the caller writes into the spec.
  const TEXT_LINE_HEIGHT = 1.4;
  function computeAddGeometry(
    containerId: string,
    isText: boolean,
  ): { frame: ItemFrame; fontSizePx?: number; fontSizeRatio?: number } | null {
    const doc = docInAgocraftRef.current;
    if (doc === undefined) return null;
    const isRoot = containerId === String(doc.root.id);

    // Box size + centre, in ratio of the PARENT, plus the parent's height in
    // design px (drives the font fill).
    let wRatio: number;
    let hTargetRatio: number;
    let cxRatio: number;
    let cyRatio: number;
    let parentHeightPx: number;
    if (isRoot) {
      const host = canvasHostRef.current;
      if (host === null) return null;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const center = screenToDesign(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const tl = screenToDesign(rect.left, rect.top);
      const br = screenToDesign(rect.right, rect.bottom);
      if (center === null || tl === null || br === null) return null;
      const vpWDesign = Math.abs(br.x - tl.x);
      const vpHDesign = Math.abs(br.y - tl.y);
      if (vpWDesign <= 0 || vpHDesign <= 0) return null;
      wRatio = (0.4 * vpWDesign) / design.width;
      hTargetRatio = ((isText ? 0.3 : 0.4) * vpHDesign) / design.height;
      cxRatio = center.x / design.width;
      cyRatio = center.y / design.height;
      parentHeightPx = design.height;
    } else {
      const box = absoluteFrameBox(doc, containerId, design.width, design.height);
      if (box === null || box.h <= 0) return null;
      wRatio = 0.4;
      hTargetRatio = isText ? 0.3 : 0.4;
      cxRatio = 0.5;
      cyRatio = 0.5;
      parentHeightPx = box.h;
    }

    // Resolved placement → frame + font is pure arithmetic, delegated to
    // the `add-geometry` module (WI-063 F-1b).
    return computeAddFrame(
      { wRatio, hTargetRatio, cxRatio, cyRatio, parentHeightPx },
      isText,
      TEXT_LINE_HEIGHT,
    );
  }
  const addGeometryRef = useRef(computeAddGeometry);
  addGeometryRef.current = computeAddGeometry;

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
      const designSize = { width: design.width, height: design.height };
      // DOM sampling (View concern) is inlined here rather than reusing
      // `sampleFrameBasis` so this memoized projector stays stable across
      // renders (it's the `project` prop of <PresenceCursors>); the math is
      // delegated to the pure projection module (WI-063 F-1a).
      const sample =
        host.querySelector("[data-frame-id]:not([data-peek-lifted])") ??
        host.querySelector("[data-frame-id]");
      if (sample instanceof HTMLElement) {
        const id = sample.getAttribute("data-frame-id");
        const item = id ? docInAgocraft.root.children.find((c) => String(c.id) === id) : undefined;
        const frame = item ? (item.attrs as { frame?: RatioFrame }).frame : undefined;
        if (frame) {
          const basis = basisFromFrameSample(sample.getBoundingClientRect(), frame, designSize);
          if (basis)
            return designToHostPx(basis, designX, designY, hostRectNow.left, hostRectNow.top);
        }
      }
      const basis = basisFromLetterbox(hostRectNow, designSize);
      return basis
        ? designToHostPx(basis, designX, designY, hostRectNow.left, hostRectNow.top)
        : null;
    },
    [design.width, design.height, docInAgocraft],
  );

  // WI-028 Phase 4 — broadcast local cursor + render remote cursors.
  // Only active when collaborative sync is wired (`sync` is defined).
  // `clientToLocal` reuses `screenToDesign`; presence positions are
  // stored in design-space so remote viewers can map them back to
  // their own host's projected pixels via `designToHost`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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

  // WI-020 — `setSelectedFrameId` mirror ref. Held here (declaration-order safe)
  // so the item-add hook and other lazy consumers can set the selection without
  // closing over a value created later in this function. Assigned below.
  const setSelectedFrameIdRef = useRef<((id: string | null) => void) | null>(null);

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
  // WI-078 — keep each chart's category labels materialized as real text Items.
  // Design px size feeds pie's circle-aspect label placement.
  useChartLabelSync(reconcileDerived, docInAgocraft, design.width, design.height);
  // WI-139 — persist fetched oEmbed metadata (title + Vimeo/Loom poster) onto
  // embed items (derived projection, bypasses history; once per url, serialized).
  useEmbedMetaSync(reconcileDerived, docInAgocraft);

  // WI-078 — inline-editing a chart LABEL text Item must rename the dataset
  // category (the label's text is derived from data). We intercept the
  // renderer's text commit: a label edit routes to the dataset; the label's own
  // frame is owned by the sync controller (so auto-resize commits are ignored).
  const handleUpdateItem = (
    itemId: string,
    patcher: (prev: Record<string, unknown>) => Record<string, unknown>,
  ): void => {
    const it = findItemDeep(docInAgocraftRef.current, itemId);
    const ref = it?.attrs?.chartLabelRef as ChartLabelRef | undefined;
    if (it !== undefined && ref !== undefined) {
      const next = patcher(it.attrs as Record<string, unknown>);
      const prevText = (it.attrs as { text?: unknown }).text;
      if (next.text !== prevText && typeof next.text === "string") {
        const chart = findItemDeep(docInAgocraftRef.current, ref.chartId);
        const cAttrs = chart?.attrs as { datasetId?: string; encoding?: ChartEncoding };
        // DR-036 — the category column comes from the channel encoding.
        const catColumn = categoryField(migrateEncoding(cAttrs?.encoding));
        if (cAttrs?.datasetId && catColumn !== undefined) {
          const text = next.text;
          // LONG-format labels (WI-084) bind the row indices of a DISTINCT
          // category spanning many rows → write the new value to each (stable
          // across per-keystroke commits); wide format edits the one row.
          const indices = ref.rowIndices;
          editor.exec("weave.dataset.update", {
            id: cAttrs.datasetId,
            patch: (p: DatasetPayload) =>
              indices !== undefined
                ? setCells(p, indices, catColumn, text)
                : setCell(p, ref.rowIndex, catColumn, text),
          });
        }
      }
      // Frame / other label attrs are controller-owned → ignore.
      return;
    }
    updateItem(itemId, (prev) => ({
      ...prev,
      attrs: patcher(prev.attrs as unknown as Record<string, unknown>) as never,
    }));
  };

  // DR-027 / WI-071 Phase 1 — manual cloud save 4-state machine + offline
  // reconcile prompt extracted to a view-model hook (save cluster). The two
  // surfaces that drive it (header button + Cmd+S via setDesignSaver) read
  // these returns; mutation still flows through useDesign's callbacks.
  const { saveStatus, handleManualSave, conflictBusy, handleConflictSave, handleConflictDiscard } =
    useDesignSave({ persistNowAwaitable, resolveLocalConflict, navigate });

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
    (window as unknown as { __weaveClipboardPeek?: () => unknown }).__weaveClipboardPeek = () =>
      clipboardStore.peek();
    // WI-187 — marker-health shim for the cross-tab e2e: lets tab B assert
    // that tab A's successful marker write activated recency routing here.
    (
      window as unknown as { __weaveMarkerRoutingActive?: () => boolean }
    ).__weaveMarkerRoutingActive = () => osMarkerRoutingActive();
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
  // WI-162 — flavor's page-unit noun ("슬라이드" / doc-page: "페이지") for the
  // Add menu section + SlidePresetPicker headline. Display metadata, so it
  // comes from FLAVOR_REGISTRY, not the editor-mode registry.
  const pageNoun = FLAVOR_REGISTRY[currentFlavor].pageNoun;

  // WI-166 / DR-114 — the composed editor-mode context for this flavor.
  // RolePolicy is the truth source for the WI-163 page(artboard) rules:
  // a stage (root-direct item on page-bounded flavors) is a fixed editing
  // context (Canva model) — no delete via canvas gestures, no keyboard-nav
  // onto it, no arrow nudge. Ref-mirrored so the deps-[] effects below
  // (deleters / navigator / keyboard) read the live flavor + doc.
  const editorMode = editorModeFor(currentFlavor);
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;
  // WI-153 P2 — page-chrome flavors (slide-deck / doc-page) edit ONE page at
  // a time. `activePageId` scopes the canvas to a single page; the rail
  // switches it. Free placement → activePageId undefined → all frames render
  // (unchanged). Both come from the injected ViewPolicy now.
  // WI-194 / DR-127 — the deck order is POLICY-DERIVED: page-bounded flavors
  // collect root-direct frames only (nested frames are groups, never tiles /
  // steps); free placement keeps the WI-072 any-depth + presentable model.
  const presentationOrder = useMemo(
    () => effectiveDeckOrder(design, editorMode.deck.collectCandidateIds),
    [design, editorMode],
  );
  const { activePageId, setActivePageId } = useActivePage(
    presentationOrder,
    editorMode.view.pageChrome,
  );
  const visibleFrameIds = useMemo(
    () => editorMode.view.visibleFrames(docInAgocraft, activePageId),
    [editorMode, docInAgocraft, activePageId],
  );
  // WI-184 ⑧ — ref-mirrored so the stable window-keydown closure below reads
  // the live deck order / active page without re-registering per change.
  const presentationOrderRef = useRef(presentationOrder);
  presentationOrderRef.current = presentationOrder;
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;
  const itemCapability = useCallback((id: string): ItemCapabilities => {
    const { roles } = editorModeRef.current;
    const doc = docInAgocraftRef.current;
    // No doc yet → element (everything allowed), same as the absorbed
    // isArtboardId predicate returning false.
    if (doc === undefined) return roles.capabilities.element;
    return capabilityOf(roles, doc, id);
  }, []);
  // WI-164 — hover-suppressed ids as a render-time set, for memoized
  // consumers that take data instead of a policy (hover-affordance
  // projector stays pure). Root-direct items are the only stage candidates
  // (RolePolicy contract — pieces/item-roles), so scanning root.children
  // covers every suppressible id. Empty on infinite canvas → the projector
  // behaves exactly as before.
  const hoverSuppressedIds: ReadonlySet<string> = useMemo(() => {
    const { roles } = editorMode;
    return new Set(
      docInAgocraft.root.children
        .map((c) => String(c.id))
        .filter((id) => !roles.capabilities[roles.roleOf(docInAgocraft, id)].hoverable),
    );
  }, [editorMode, docInAgocraft]);
  // WI-153 P3 (DR-111 D5) — default add container. Page-bounded formats route
  // selection-less adds into the ACTIVE PAGE instead of the design root (root is
  // page chrome there, not an editing surface). Policy from the injected
  // InsertionPolicy; ref-mirrored so useItemAdd's stable closures read the
  // live value.
  const defaultAddContainerId = editorMode.insertion.containerFor(docInAgocraft, activePageId);
  const defaultAddContainerIdRef = useRef(defaultAddContainerId);
  defaultAddContainerIdRef.current = defaultAddContainerId;
  // WI-153 P2.5 — measure the thumbnail rail (variable height) so the page-bounded
  // fit sits ABOVE it and BELOW the fixed 48px header (h-12), not hidden under the
  // chrome. Callback ref → re-measures when the rail mounts/unmounts or resizes.
  const [railEl, setRailEl] = useState<HTMLDivElement | null>(null);
  const [railHeight, setRailHeight] = useState(0);
  useEffect(() => {
    if (railEl === null) {
      setRailHeight(0);
      return;
    }
    const measure = () => setRailHeight(railEl.getBoundingClientRect().height);
    const ro = new ResizeObserver(measure);
    ro.observe(railEl);
    measure();
    return () => ro.disconnect();
  }, [railEl]);
  // Inset the base fit only for page-chrome flavors (free placement keeps its
  // full-plane fit + free pan). 48 = DesignHeader h-12.
  const fitInset = useMemo(
    () => (editorMode.view.pageChrome ? { top: 48, bottom: railHeight } : undefined),
    [editorMode, railHeight],
  );
  // WI-153 P4 — latest-value mirror so the hover bridge (deps: [hoverContext]) can
  // gate on the active page without re-subscribing.
  const visibleFrameIdsRef = useRef(visibleFrameIds);
  visibleFrameIdsRef.current = visibleFrameIds;

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
  // WI-065 / DR-031 — keep the ref pointed at the live selectFrame for the
  // vertex-handle break action (see the poly VM registration above).
  selectFrameRef.current = selectFrame;
  // WI-069 — drop the selected vertex when its owning item is no longer selected.
  useEffect(() => {
    const v = vertexSelection.get();
    if (v !== null && !selectedIds.has(v.itemId)) vertexSelection.clear();
  }, [selectedIds]);
  // WI-092 — drop the selected chart DATUM (bar/slice) when its chart item is no
  // longer selected (deselect / switch to another item), so its drag handles
  // don't linger or reappear on a different chart. Mirrors the vertex cleanup.
  useEffect(() => {
    const c = chartElementStore.get();
    if (c !== null && !selectedIds.has(c.chartItemId)) chartElementStore.set(null);
  }, [selectedIds]);
  const selectedFrameId = selection?.kind === "frame" ? selection.id : undefined;
  const _isMultiSelect = selectedIds.size > 1;
  // WI-038 Phase 2 — derive peek container from selection. Selecting any
  // item makes peek index THAT item's parent's children (so the user can
  // L+drag to reorder the siblings of the selected item). No selection ⇒
  // root.children (legacy top-level peek behavior). Same semantics as the
  // four `weave.item.*` z-order commands so the two surfaces stay aligned.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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

  // DR-027 / WI-071 Phase 1 — WI-039 two-stage z-order focus (dim/isolate gate
  // sets + camera-fit handlers) extracted to a view-model hook. Read-only over
  // the document; focus is independent of selection.
  const {
    focusedId,
    dimmedFrameIds,
    isolatedFrameIds,
    disabledFrameIds,
    focusStage,
    handleCycleFocus,
    handleClearFocus,
    handleZoomToFrame,
    handleFitAll,
  } = useFrameFocus({
    document: docInAgocraft,
    designWidth: design.width,
    designHeight: design.height,
  });

  // WI-153 P4 — agent working-camera on page-chrome flavors must also SWITCH the
  // active page: only the active page renders, so fitting the camera to a hidden
  // slide would show nothing. Membership-guarded against the page order —
  // `setActivePageId` falls back to the FIRST page for unknown ids
  // (resolveActivePage), so passing a non-page id would wrongly jump the view.
  const handleAgentZoomToFrame = useCallback(
    (frameId: string) => {
      if (editorMode.view.pageChrome && presentationOrder.includes(frameId)) {
        setActivePageId(frameId);
      }
      handleZoomToFrame(frameId);
    },
    [editorMode, presentationOrder, setActivePageId, handleZoomToFrame],
  );

  // WI-169 — synchronous activation when the AGENT creates a page
  // (weave.page.add / weave.page.duplicate ok). Rail-"+" parity: same
  // select + activate pair as onAddPage, same clickActivatesPage gate.
  // Without this the agent's next omitted-containerId add races the 200ms
  // debounced camera path and lands on the OLD active page (invisible —
  // non-active pages don't render).
  const handleAgentPageActivate = useCallback(
    (id: string) => {
      setSelectedFrameId(id);
      if (editorMode.rail.clickActivatesPage) {
        setActivePageId(id);
      }
    },
    [editorMode, setSelectedFrameId, setActivePageId],
  );

  // WI-033 P2 dead-code cleanup — `enteredFrameStack` consumer +
  // `setEnteredFrameId` callback removed. Phase 12 drill-in mode is
  // deprecated (DR-017); the vm slot itself stays on agocraft until
  // a follow-up HANDOFF retires it, but weave no longer reads or
  // writes it. The breadcrumb, FrameContextMenu "Enter frame" item,
  // and NestedFrame enteredId/onEnter prop wiring were all removed
  // in the same WI-033 P2 step.

  // DR-027 / WI-071 Phase 1 — V/H hand-tool toggle (vm.handTool single source +
  // V/H hotkeys) extracted to a view-model hook. Bound only when the
  // CameraPolicy grants the drag-pan gesture.
  const { handMode, setHandMode } = useHandTool({ vm, enabled: editorMode.camera.dragPan });

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
    getDesignSize: () => ({ width: design.width, height: design.height }),
  });
  // WI-043 — layout-child move: plain-dragging the SELECTED layout child
  // repositions it (grid → drop on cell, incl. empty cells; flex → swap
  // sequence order). Selection-state based, so a frame-selected drag still
  // moves the frame (even when the layout is full).
  const layoutChildDrag = useLayoutChildDragController({
    editor,
    getDocument: () => docInAgocraftRef.current ?? null,
    getSelectedIds: () => reparentSelectedIdsRef.current,
    enabled: !handMode && !peek.isActive,
  });
  // WI-033 P2 — Esc-exits-entered-frame effect removed alongside the
  // drill-in mode. Selection deselect on Esc remains an open question
  // (P3 follow-up); for now the standard browser focus model handles
  // Esc inside text inputs natively.

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

  // Bridge the hovered item into `frameHoverStore` so a MULTI-selection
  // reveals each item's chrome on hover (chart-bar parity). This DERIVES from
  // `hoverContext` rather than adding a second pointermove listener —
  // `useHoverContext` is the single source of truth for "what's under the
  // pointer", and the two systems stay distinct in purpose: `hoverContext`
  // drives the unselected-item hover affordance (which excludes selected ids),
  // while `frameHoverStore` only gates the SELECTED item's chrome. They never
  // paint the same item. A "handle" hover KEEPS the current item (so the
  // chrome and the handle under the cursor don't vanish mid-resize); a real
  // document item sets it; anything else (bare canvas, a non-item surface)
  // clears it.
  useEffect(() => {
    const { hoveredKind, hoveredId } = hoverContext;
    if (hoveredKind === "handle") return; // over a handle — keep current item
    const doc = docInAgocraftRef.current;
    // WI-153 P4 — page-bounded: only the ACTIVE page is mounted on the canvas, but the
    // thumbnail rail still publishes `data-frame-kind` for every page, which the
    // model-driven hover projector would paint as a phantom outline on a non-active
    // page. Suppress hover for any top-level page that isn't the visible one.
    const visible = visibleFrameIdsRef.current;
    if (
      visible !== undefined &&
      hoveredId !== undefined &&
      !visible.has(hoveredId) &&
      doc.root.children.some((c) => String(c.id) === hoveredId)
    ) {
      frameHoverStore.set(null);
      return;
    }
    frameHoverStore.set(
      hoveredId !== undefined && findItemDeep(doc, hoveredId) !== undefined ? hoveredId : null,
    );
  }, [hoverContext]);

  // WI-072 — paste target container: a selected NON-frame item routes the
  // paste to THAT item's parent so the clone lands beside it (parent is
  // root → undefined; mode-independent). A selected frame / no selection
  // resolves through the mode's InsertionPolicy.addContainerFor (WI-180):
  // free placement pastes INTO the selected frame (or the root), page-bounded
  // flavors paste onto the ACTIVE PAGE — never the design root, where the
  // item would land invisibly outside the page-scoped view.
  // Shared by resolveContainerId + resolveContainerSizePx so both agree.
  const pasteTargetContainerId = (): string | undefined => {
    const sel =
      selectedFrameId !== undefined ? findItemDeep(docInAgocraft, selectedFrameId) : undefined;
    if (sel !== undefined && sel.kind !== "frame") {
      const parent = findParentAndIndex(docInAgocraft, String(sel.id));
      if (parent === undefined) return undefined;
      const pid = String(parent.parent.id);
      return pid === String(docInAgocraft.root.id) ? undefined : pid;
    }
    return editorMode.insertion.addContainerFor(docInAgocraft, activePageId, selectedFrameId);
  };

  // WI-072 — paste/import destination container: into the selected frame (or
  // the selected item's parent frame), not always the root. Shared verbatim
  // by the clipboard paste command (WI-041) and the file-import paste
  // (WI-089) so a Cmd+V and an "Import" land an item the same way.
  const resolvePasteContainerSizePx = (): { width: number; height: number } | null => {
    // FrameStage's host element is the live design plane — its bounding
    // box (in CSS pixels) is the conversion factor we need to project
    // pointer/offset into the parent's 0..1 ratio space (D5).
    const host = canvasHostRef.current;
    if (host === null) return null;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    // WI-072 — when pasting INTO a frame, the container's px size is that
    // frame's rendered footprint, not the whole design plane — otherwise the
    // pasted item's 0..1 ratio is mis-scaled. Scale the absolute frame box
    // (design units) by the host's px-per-design-unit.
    const cid = pasteTargetContainerId();
    if (cid !== undefined) {
      const box = absoluteFrameBox(docInAgocraft, cid, design.width, design.height);
      if (box !== null && box.w > 0 && box.h > 0) {
        return {
          width: (box.w / design.width) * rect.width,
          height: (box.h / design.height) * rect.height,
        };
      }
    }
    return { width: rect.width, height: rect.height };
  };
  // HoverContext (v1) does not track pixel coordinates yet — only the hovered
  // surface id. The paste resolver therefore takes its offset path, placing
  // the new item at sourceFrame + 8px * N (D5 keyboard-paste fallback).
  const resolvePastePointer = (): { x: number; y: number } | undefined => undefined;

  // WI-089 — ephemeral export/import feedback. A single transient line
  // (reuses the design-system `Banner`, auto-clears) so an empty selection,
  // a bad file, or a successful round-trip is acknowledged without a
  // standing toast subsystem.
  const [exportImportInfo, setExportImportInfo] = useState<string | null>(null);
  const exportImportInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showExportImportInfo = useCallback((message: string) => {
    setExportImportInfo(message);
    if (exportImportInfoTimer.current !== null) clearTimeout(exportImportInfoTimer.current);
    exportImportInfoTimer.current = setTimeout(() => setExportImportInfo(null), 3200);
  }, []);
  useEffect(
    () => () => {
      if (exportImportInfoTimer.current !== null) clearTimeout(exportImportInfoTimer.current);
    },
    [],
  );

  // WI-041 Phase 2/3 — register the clipboard command host slot. The
  // hook subscribes to `clipboardStore` so `hasItems` flips reactively
  // on copy/cut/paste, driving the paste button's enabled state.
  const clipboardCommands = useClipboardCommands({
    editor,
    selectedId: selectedFrameId,
    // Figma parity — pasted items land selected (all of them on a
    // multi-select paste).
    onPasted: (ids) => {
      if (ids.length === 1) setSelectedFrameId(ids[0]);
      else if (ids.length > 1) selectFrames(ids);
    },
    resolveContainerId: () => {
      // WI-072 — paste into the selected frame (or the selected item's parent
      // frame), not always the root. Earlier this hardcoded `undefined`, so a
      // copy from inside a frame always re-pasted at the design root.
      return pasteTargetContainerId();
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
    resolveContainerSizePx: resolvePasteContainerSizePx,
    resolvePointerInContainer: resolvePastePointer,
    // WI-185 ⑫ (spec D-5) — page-bounded flavors paste with the office
    // contract (cross-page = source position); free placement keeps the
    // cursor/offset model. Policy-fed, no flavor compare.
    resolvePasteCoordMode: () => editorMode.insertion.pasteCoord,
  });

  // WI-089 — design-selection export / import. EXPORT serialises the current
  // selection to a downloadable `.json`; IMPORT validates a picked file and
  // pastes its items through the SAME `weave.clipboard.paste` verb (single
  // Cmd+Z, remapIds, MAX_PASTE_NODES cap). The hidden file input + ephemeral
  // feedback banner are rendered below.
  const exportImport = useExportImport({
    editor,
    getDocument: () => docInAgocraft,
    resolveExportItemIds: () => Array.from(selectedIds),
    designTitle: design.title,
    resolveContainerId: () => pasteTargetContainerId(),
    resolveContainerSizePx: resolvePasteContainerSizePx,
    resolvePointerInContainer: resolvePastePointer,
    onPasted: (ids) => {
      if (ids.length === 1) setSelectedFrameId(ids[0]);
      else if (ids.length > 1) selectFrames(ids);
    },
    onInfo: (message) => showExportImportInfo(message),
  });
  const importInputRef = useRef<HTMLInputElement>(null);

  // DR-027 / WI-071 Phase 1 — command-host derivation (commandContext +
  // dispatchCommand), the multi-same-parent invariant, and command-palette
  // open state extracted to a view-model hook (WI-026/027/036/041). All
  // command execution still routes through dispatchEditorCommand.
  const { commandContext, dispatchCommand, multiSameParent, paletteOpen, setPaletteOpen } =
    useDesignCommandHost({
      document: docInAgocraft,
      selectedFrameId,
      selectedIds,
      canUndo,
      canRedo,
      hoverContext,
      clipboardHasItems: clipboardCommands.hasItems,
      editor,
      bumpHistoryTick,
    });
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
      if (nextId === undefined) return;
      // WI-163 — keyboard nav never lands ON a page (artboard): drillUp from
      // a top-level item would select it, and sibling-cycling FROM the page
      // (escape-hatch deep selection) would walk the HIDDEN pages. drillDown
      // (page → first child) returns a non-page id, so it stays allowed.
      if (!itemCapability(nextId).navigable) return;
      selectFrame(nextId);
    });
  }, [selectFrame, itemCapability]);

  // WI-180 — selection-aware add container (InsertionPolicy.addContainerFor).
  // Free placement: a selected frame captures the explicit add; page-bounded:
  // the ACTIVE PAGE always (sub-page frames are groups, not editing
  // surfaces). Ref-mirrored resolver so useItemAdd's stable closures read
  // the live policy + selection at click/hotkey time.
  const resolveAddContainerRef = useRef<() => string | undefined>(() => undefined);
  resolveAddContainerRef.current = () =>
    editorMode.insertion.addContainerFor(docInAgocraft, activePageId, selectedFrameIdRef.current);

  // DR-027 / WI-071 Phase 2 — WI-020 item-add cluster ("+" add menu + R/T/L/F
  // tool-hotkey adder + slide-preset dialog state) extracted to a cooperating
  // hook. Called here (after selectedFrameIdRef exists) and injected the
  // orchestrator-owned shared refs (addGeometryRef / selectedFrameIdRef /
  // setSelectedFrameIdRef). Creation routes through editor.exec.
  const { addNewItem, slidePickerOpen, setSlidePickerOpen } = useItemAdd({
    editor,
    document: docInAgocraft,
    docRef: docInAgocraftRef,
    selectedFrameIdRef,
    setSelectedFrameIdRef,
    addGeometryRef,
    resolveAddContainerRef,
    designWidth: design.width,
    designHeight: design.height,
  });

  // WI-185 ⑰ + WI-186 — native paste router: weave marker → internal paste,
  // OS image without marker → ingest (recency contract, DR-122). Image
  // inserts go through the same add path as the "+" menu so container
  // resolution (InsertionPolicy), geometry, and post-add selection all match.
  useOsPasteRouting({
    addImage: (src) => addNewItem("image", undefined, src),
    onInfo: (message) => showExportImportInfo(message),
  });

  // WI-027 Phase D — register host action slots for hover-scope commands.
  // The slots receive the hovered frame id from the dispatcher and run
  // the appropriate weave action (delete / duplicate / open media src
  // picker). The slots persist for the lifetime of this component.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    return setFrameDeleter((frameId) => {
      // WI-163 — pages are not deletable via canvas gestures (rail's job).
      if (!itemCapability(frameId).deletable) return;
      // DR-061 — a locked item is protected from deletion.
      const it = findItemDeep(docInAgocraftRef.current, frameId);
      if (it !== undefined && isItemLocked(it)) return;
      removeItem(frameId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- removeItem is the
    // stable editor.exec("weave.item.remove") wrapper defined above.
  }, []);
  // DR-061 — lock/unlock toggle slot. Operates on the WHOLE current selection
  // (single OR multi): lock ALL if any is unlocked, else unlock all. Batched so
  // a multi-toggle is one undo step. Undoable via the generic attr command.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    return setLockToggler(() => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length === 0) return;
      const anyUnlocked = ids.some((id) => {
        const it = findItemDeep(docInAgocraftRef.current, id);
        return !(it !== undefined && isItemLocked(it));
      });
      const nextLocked = anyUnlocked;
      editor.runBatch(() => {
        for (const id of ids) {
          editor.exec("weave.item.update", { itemId: id, attrs: { locked: nextLocked } });
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor is stable.
  }, []);
  // DR-design-016 Phase 2 — duplicate slot. Real copy of the current selection
  // (single → weave.item.duplicate, multi → weave.items.duplicate).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    return setItemDuplicator(() => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length === 0) return;
      if (ids.length === 1) editor.exec("weave.item.duplicate", { itemId: ids[0] });
      else editor.exec("weave.items.duplicate", { itemIds: ids });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor is stable.
  }, []);
  // WI-050 — "delete frame, keep children". Reparent the frame's children
  // to the root design and remove the frame in one transaction. Live design
  // size is read via ref (rarely changes, but stays exact for a rotated
  // ancestor under a non-square design). Used by BOTH the QuickActionBar
  // slot below and the Cmd+Backspace handler in the keydown listener.
  const designSizeRef = useRef({ width: design.width, height: design.height });
  designSizeRef.current = { width: design.width, height: design.height };
  const dissolveFrame = useCallback(
    (frameId: string) => {
      editor.exec("weave.frame.removeKeepingChildren", {
        frameId,
        designWidth: designSizeRef.current.width,
        designHeight: designSizeRef.current.height,
      });
      selectFrame(null); // the frame is gone — drop the dangling selection.
    },
    [editor, selectFrame],
  );
  useEffect(() => setFrameDissolver(dissolveFrame), [dissolveFrame]);
  // WI-072 — toggle a frame's deck membership (slide ↔ group) by setting
  // `attrs.presentable`. Default (absent/true) = slide; `false` drops it from
  // the deck into the thumbnail panel's non-slide section. Goes through a
  // command so Cmd+Z reverts it.
  const toggleFrameSlide = useCallback(
    (frameId: string, presentable: boolean) => {
      editor.exec("weave.item.update", {
        itemId: frameId,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: { ...prev.attrs, presentable },
        }),
      });
    },
    [editor],
  );
  // WI-072 — QuickActionBar entry point: read the frame's current membership
  // and flip it (the bar is a single toggle, the thumbnail panel passes the
  // explicit target value).
  const docRefForToggle = useRef(docInAgocraft);
  docRefForToggle.current = docInAgocraft;
  const toggleFrameSlideFlip = useCallback(
    (frameId: string) => {
      const it = findItemDeep(docRefForToggle.current, frameId);
      if (it === undefined) return;
      const current = (it.attrs as { presentable?: boolean }).presentable !== false;
      toggleFrameSlide(frameId, !current);
    },
    [toggleFrameSlide],
  );
  useEffect(() => setFrameSlideToggler(toggleFrameSlideFlip), [toggleFrameSlideFlip]);
  // WI-036 follow-up — multi-selection delete. Iterates the live
  // `selectedIds` (via ref to avoid re-registering on every selection
  // change) and dispatches `weave.item.remove` for each. After the
  // batch the editor's history records each as a separate undo step;
  // a future `weave.items.removeBatch` macro can collapse them into
  // a single inverse patch.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  // WI-185 ⑬ — smart duplicate (office Cmd+D rhythm). Remembers the LAST
  // duplicate gesture {sourceIds, cloneIds} (kit returns clones in input
  // order, so the arrays index-align). If the NEXT Cmd+D fires while the
  // selection is exactly those clones, the live source→clone frame delta —
  // i.e. wherever the user MOVED the copy since — is measured and repeated
  // via weave.items.duplicateWithDelta, so copy → nudge → Cmd+D Cmd+D lays
  // out an even series. Any other selection resets to the plain duplicate.
  // Multi-select moves rigidly (WI-159), so the first resolvable pair
  // carries the delta for the whole set.
  const smartDuplicateRef = useRef<{
    sourceIds: ReadonlyArray<string>;
    cloneIds: ReadonlyArray<string>;
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    return setMultiDeleter(() => {
      const all = Array.from(selectedIdsRef.current);
      // DR-061 — never delete locked items; WI-163 — never delete pages.
      const ids = all.filter((id) => {
        if (!itemCapability(id).deletable) return false;
        const it = findItemDeep(docInAgocraftRef.current, id);
        return !(it !== undefined && isItemLocked(it));
      });
      if (ids.length === 0) return;
      // Single batch command → one undo step restores every deleted item.
      editor.exec("weave.items.remove", { itemIds: ids });
      // Drop the selection — the items are gone.
      selectFrame(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor
    // / selectFrame are stable from useDesign / useSelection.
  }, []);
  // Standard editor keyboard shortcuts that must defer to native text
  // editing. These are handled here — NOT via the agocraft hotkey
  // registry — because the registry preventDefault()s on every match
  // BEFORE its action can check the focus target, which would hijack the
  // browser's native Select-All / Delete / Backspace / Escape inside an
  // input / textarea / Lexical contenteditable. This window listener
  // bails first when a text surface owns focus, so typing stays intact.
  // WI-074 D8b — commit the live crop draft (완료) for an item, then end the crop.
  const applyCrop = useCallback(
    (cropItemId: string) => {
      const d = croppingState.getDraft();
      if (d !== null) {
        editor.exec("weave.image.setCrop", {
          itemId: cropItemId,
          crop: { x: d.x, y: d.y, w: d.w, h: d.h },
          ...(d.rotation !== 0 ? { rotation: d.rotation } : {}),
          // WI-074 D12 — persist the in-magnification pan offset.
          offset: { ox: d.ox, oy: d.oy },
        });
      }
      croppingState.exit(cropItemId);
    },
    [editor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      // WI-074 D8b — an open image crop owns the keyboard: Enter = 완료 (commit the
      // draft), ESC = 취소 (discard). All other editor keys are suppressed mid-crop.
      if (isCroppingNow()) {
        const cropItemId = croppingState.activeId();
        if (e.key === "Enter" && cropItemId !== null) {
          e.preventDefault();
          applyCrop(cropItemId);
        } else if (e.key === "Escape" && cropItemId !== null) {
          e.preventDefault();
          croppingState.exit(cropItemId);
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      // WI-184 ⑧ — PageUp/PageDown = previous/next slide, from canvas focus
      // too (office 3/5 consensus: the slide is the working unit). Gated on
      // the live active page — free placement has none (undefined), so the
      // keys fall through untouched (no flavor compare; the degenerate case
      // IS the gate). Mirrors a rail tile click exactly: select + activate
      // through the same clickActivatesPage policy gate.
      if (!mod && !e.altKey && (e.key === "PageUp" || e.key === "PageDown")) {
        const cur = activePageIdRef.current;
        if (cur === undefined) return;
        const order = presentationOrderRef.current;
        const i = order.indexOf(cur);
        if (i < 0) return;
        // Even at the deck edges the key means "slide nav" here — consume it
        // so the browser never scrolls the page chrome.
        e.preventDefault();
        const next = order[e.key === "PageDown" ? i + 1 : i - 1];
        if (next === undefined) return; // clamp at the ends (office behavior, no wrap)
        setSelectedFrameId(next);
        if (editorModeRef.current.rail.clickActivatesPage) setActivePageId(next);
        return;
      }
      // WI-183 — plain Enter with exactly ONE item selected enters text edit
      // when that item has a registered text surface (5-tool consensus:
      // Enter starts editing the selected text). No kind compare here — the
      // surface registered itself in `textEditTrigger` (Rule 6). A non-text
      // selection has no registration → Enter falls through untouched.
      if (!mod && !e.shiftKey && !e.altKey && e.key === "Enter") {
        const ids = Array.from(selectedIdsRef.current);
        if (ids.length === 1 && textEditTrigger.trigger(String(ids[0]))) {
          e.preventDefault();
        }
        return;
      }
      // Cmd/Ctrl + A — context-aware Select All. A frame selected ⇒ that
      // frame's first-level children (drill-in select); a non-frame leaf
      // selected ⇒ its PARENT's children (siblings — WI-180: ⌘A after
      // clicking an item selects everything at that level instead of
      // no-op'ing); nothing selected ⇒ the mode's base editing container
      // (design root on infinite canvas, the ACTIVE PAGE on page-bounded
      // flavors — the visible slide is the implicit context, hidden
      // sibling pages never join). The base comes from the injected
      // InsertionPolicy via defaultAddContainerIdRef — no flavor compare
      // here (Rule 6 / DR-114 §6-G4).
      if (mod && !e.shiftKey && !e.altKey && (e.key === "a" || e.key === "A")) {
        const doc = docInAgocraftRef.current;
        if (doc === undefined) return;
        const baseId = defaultAddContainerIdRef.current;
        const base = baseId !== undefined ? (findItemDeep(doc, baseId) ?? doc.root) : doc.root;
        const selId = selectedFrameIdRef.current;
        const selItem = selId !== undefined ? findItemDeep(doc, selId) : undefined;
        const container =
          selItem === undefined
            ? base
            : selItem.kind === "frame"
              ? selItem
              : (findParentAndIndex(doc, String(selItem.id))?.parent ?? base);
        const childIds = container.children.filter(isDomainItem).map((c) => String(c.id));
        if (childIds.length === 0) return;
        e.preventDefault();
        selectFrames(childIds);
        return;
      }
      // Cmd/Ctrl + D — duplicate the selection in place (offset copy) and
      // select the new items. One batch command (clipboard untouched) → a
      // single undo step removes every copy. WI-185 ⑬ — when the selection
      // is exactly the clones of the PREVIOUS Cmd+D, the source→clone delta
      // (wherever the user moved the copy) is measured live and repeated
      // (smartDuplicateRef above), so Cmd+D · move · Cmd+D · Cmd+D lays out
      // an even series — the office duplicate rhythm.
      if (mod && !e.shiftKey && !e.altKey && (e.key === "d" || e.key === "D")) {
        const ids = Array.from(selectedIdsRef.current);
        if (ids.length === 0) return;
        e.preventDefault();
        const prev = smartDuplicateRef.current;
        const doc = docInAgocraftRef.current;
        let delta: { dx: number; dy: number } | undefined;
        if (
          prev !== null &&
          doc !== undefined &&
          ids.length === prev.cloneIds.length &&
          ids.every((id) => prev.cloneIds.includes(id))
        ) {
          for (let i = 0; i < prev.sourceIds.length; i += 1) {
            const sId = prev.sourceIds[i];
            const cId = prev.cloneIds[i];
            if (sId === undefined || cId === undefined) continue;
            const sf = (findItemDeep(doc, sId)?.attrs as { frame?: { x: number; y: number } })
              ?.frame;
            const cf = (findItemDeep(doc, cId)?.attrs as { frame?: { x: number; y: number } })
              ?.frame;
            if (sf !== undefined && cf !== undefined) {
              delta = { dx: cf.x - sf.x, dy: cf.y - sf.y };
              break;
            }
          }
        }
        const r =
          delta !== undefined
            ? editor.exec<unknown, ReadonlyArray<string>>("weave.items.duplicateWithDelta", {
                itemIds: ids,
                dx: delta.dx,
                dy: delta.dy,
              })
            : editor.exec<unknown, ReadonlyArray<string>>("weave.items.duplicate", {
                itemIds: ids,
              });
        if (r.ok && r.value.length > 0) {
          smartDuplicateRef.current = { sourceIds: ids, cloneIds: r.value };
          selectFrames(r.value);
        }
        return;
      }
      // WI-185 ⑭ — Cmd/Ctrl + G: wrap the selection in a new frame (group);
      // Cmd/Ctrl + Shift + G: dissolve the selected frame (ungroup — alias
      // of Cmd+Backspace below). Handled here for the same focus-target
      // reason as the rest of this listener. Capability-gated: pages
      // (stages) are not movable, so they never join a wrap; locked items
      // stay out too (lock = no structural edits, same rule as delete).
      if (mod && !e.altKey && (e.key === "g" || e.key === "G")) {
        if (e.shiftKey) {
          const selId = selectedFrameIdRef.current;
          if (selId === undefined) return;
          e.preventDefault();
          dissolveFrame(selId);
          return;
        }
        const ids = Array.from(selectedIdsRef.current).filter((id) => {
          if (!itemCapability(id).movable) return false;
          const it = findItemDeep(docInAgocraftRef.current, id);
          return !(it !== undefined && isItemLocked(it));
        });
        if (ids.length === 0) return;
        e.preventDefault();
        const r = editor.exec<unknown, string>("weave.items.group", {
          itemIds: ids,
          designWidth: designSizeRef.current.width,
          designHeight: designSizeRef.current.height,
        });
        if (r.ok) selectFrames([r.value]);
        return;
      }
      // WI-050 — Cmd/Ctrl + Backspace: delete the selected frame but keep
      // its children (reparent them to the root design). Handled here, NOT
      // in the agocraft hotkey registry, for the same reason as plain
      // Delete/Backspace: the registry preventDefault()s before its action
      // can check the focus target, which would hijack native delete inside
      // a text field. `selectedFrameIdRef` is already frame-only (it tracks
      // `selection.kind === "frame"`), so a primitive / multi-selection
      // falls through to the `if (mod) return` below untouched.
      if (mod && !e.shiftKey && !e.altKey && e.key === "Backspace") {
        const selId = selectedFrameIdRef.current;
        if (selId === undefined) return;
        e.preventDefault();
        dissolveFrame(selId);
        return;
      }
      // WI-185 ⑱ — Shift+2: zoom the camera to the current selection (Figma
      // parity). Matched on `e.code` because Shift+2 types "@" on most
      // layouts — the physical digit key is the binding. Union of the
      // selected items' absolute boxes through the same cameraFitBox slot
      // as every other fit (shared FRAME_FIT_FILL breathing room).
      if (!mod && e.shiftKey && !e.altKey && e.code === "Digit2") {
        const ids = Array.from(selectedIdsRef.current);
        if (ids.length === 0) return;
        const doc = docInAgocraftRef.current;
        if (doc === undefined) return;
        const { width: dw, height: dh } = designSizeRef.current;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let found = false;
        for (const id of ids) {
          const box = absoluteFrameBox(doc, id, dw, dh);
          if (box === null) continue;
          minX = Math.min(minX, box.x);
          minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + box.w);
          maxY = Math.max(maxY, box.y + box.h);
          found = true;
        }
        if (!found) return;
        e.preventDefault();
        cameraFitBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
        return;
      }
      // Other Cmd/Ctrl combos are owned by the agocraft hotkey registry
      // (undo / redo / copy / cut / paste / save / z-order) or FrameStage's
      // zoom handler (=/-/0). Leave them.
      if (mod) return;
      // Delete / Backspace.
      if (e.key === "Delete" || e.key === "Backspace") {
        // WI-069 — a SELECTED vertex takes priority: remove that vertex (not the
        // whole item). One weave.item.update → one undo; clear the selection.
        const vsel = vertexSelection.get();
        if (vsel !== null) {
          e.preventDefault();
          const item = findItemDeep(docInAgocraftRef.current, vsel.itemId);
          const a = item?.attrs as
            | {
                frame?: { x: number; y: number; width: number; height: number; rotation?: number };
                points?: ReadonlyArray<{ x: number; y: number; smooth?: boolean }>;
                subAttrs?: {
                  points?: ReadonlyArray<{ x: number; y: number; smooth?: boolean }>;
                  closed?: boolean;
                };
              }
            | undefined;
          const isLine = item?.kind === "line";
          const pts = isLine ? a?.points : a?.subAttrs?.points;
          // WI-069 — shared removal refits the frame to the survivors (DR-024).
          if (pts !== undefined && a?.frame !== undefined) {
            removeVertexAndRefit(
              editor,
              {
                itemId: vsel.itemId,
                isLine,
                points: pts,
                closed: isLine ? false : (a.subAttrs?.closed ?? true),
                frame: a.frame,
              },
              vsel.index,
            );
          }
          vertexSelection.clear();
          return;
        }
        // Otherwise remove every selected item in ONE batch (single undo).
        const all = Array.from(selectedIdsRef.current);
        if (all.length === 0) return;
        // DR-061 — locked items are protected from deletion; WI-163 — pages
        // (artboards) too. Always preventDefault so Backspace never navigates.
        const ids = all.filter((id) => {
          if (!itemCapability(id).deletable) return false;
          const it = findItemDeep(docInAgocraftRef.current, id);
          return !(it !== undefined && isItemLocked(it));
        });
        e.preventDefault();
        if (ids.length === 0) return; // all locked → consume the key, delete nothing
        editor.exec("weave.items.remove", { itemIds: ids });
        selectFrame(null);
        return;
      }
      // Escape — clear the selection. No preventDefault / stopPropagation
      // so transient-gesture Esc handlers (marquee / rubber-band / peek)
      // still compose. Bail when there's nothing selected so those
      // handlers see the key untouched.
      if (e.key === "Escape") {
        // WI-092 / WI-069 — layered Escape, deepest level first: a selected chart
        // DATUM (bar) clears before a vertex; either clears before the item.
        // (bar / vertex selections imply the chart / shape item stays selected.)
        if (chartElementStore.get() !== null) {
          chartElementStore.set(null);
          return;
        }
        if (vertexSelection.get() !== null) {
          vertexSelection.clear();
          return;
        }
        if (selectedIdsRef.current.size === 0) return;
        selectFrame(null);
        return;
      }
      // Arrow keys — nudge the selection. 1px, or 10px with Shift. The
      // pixel delta is converted to the parent's 0..1 ratio space via the
      // parent's *rendered* rect (same screen-pixel feel as a drag, so the
      // step stays consistent under zoom). One resizeMulti per press → one
      // undo step. A layout-managed (flex/grid) child reflows back into its
      // slot, so the nudge is a harmless no-op for those.
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        // WI-163 — pages (artboards) never move; the escape-hatch deep
        // selection (page fill editing) must not arrow-nudge the page.
        const ids = Array.from(selectedIdsRef.current).filter((id) => itemCapability(id).movable);
        if (ids.length === 0) return;
        const doc = docInAgocraftRef.current;
        if (doc === undefined) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dxPx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dyPx = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const parentPxOf = (id: string): { width: number; height: number } | null => {
          const found = findParentAndIndex(doc, id);
          const isRoot = found === undefined || String(found.parent.id) === String(doc.root.id);
          const el = isRoot
            ? canvasHostRef.current
            : document.querySelector(`[data-frame-id="${found.parent.id}"]`);
          if (!(el instanceof HTMLElement)) return null;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return null;
          return { width: r.width, height: r.height };
        };
        const updates = ids.flatMap((id) => {
          const item = findItemDeep(doc, id);
          if (item === undefined) return [];
          const f = (item.attrs as { frame?: ItemFrame }).frame;
          if (f === undefined) return [];
          const px = parentPxOf(id);
          if (px === null) return [];
          return [
            { itemId: id, frame: { ...f, x: f.x + dxPx / px.width, y: f.y + dyPx / px.height } },
          ];
        });
        if (updates.length === 0) return;
        editor.exec("weave.items.resizeMulti", { updates });
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    editor,
    selectFrames,
    selectFrame,
    dissolveFrame,
    applyCrop,
    itemCapability,
    // WI-184 ⑧ — both stable (useState setter / useCallback); listed for lint
    // correctness, not expected to re-register.
    setSelectedFrameId,
    setActivePageId,
  ]);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    return setMultiAligner((op: MultiAlignOp) => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length < 2) return;
      if (!multiSameParentRef.current) return;
      const doc = docInAgocraftRef.current;
      const inputs: ReadonlyArray<{
        readonly id: string;
        readonly frame: { x: number; y: number; width: number; height: number; rotation?: number };
      }> = ids.flatMap((id) => {
        const item = findItemDeep(doc, id);
        if (item === undefined) return [];
        const f = (item.attrs as { frame?: ItemFrame }).frame;
        if (f === undefined) return [];
        // Pass rotation through so `computeAlignedFrames` aligns rotated
        // items by their outer (axis-aligned) bounds, not the raw slot.
        return [
          { id, frame: { x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation } },
        ];
      });
      if (inputs.length < 2) return;
      const out = computeAlignedFrames(inputs, op);
      // Resize batch — emit only items whose frame actually changed so
      // history stays clean (no zero-delta entries for already-aligned
      // input). Approx-equal guard tolerates the FP drift from
      // bbox-center math (`(min + max) / 2 - w / 2`).
      const updates = out.flatMap((o, i) => {
        const prev = nn(inputs[i]).frame;
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
  // WI-048 — hover preview of the multi-select Flex / Grid arrange. The bar's
  // button hover sets the target layout; the overlay (below) computes ghost
  // positions with the same pure helper the apply path uses.
  const [arrangePreview, setArrangePreview] = useState<ArrangeLayout | null>(null);

  // WI-048 — arrange the multi-selection into Flex / Grid. Same shape as the
  // align slot above: read live ids + doc via refs, build same-parent inputs,
  // run the pure `computeArrangedFrames`, dispatch one resizeMulti batch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    return setMultiLayoutArranger((layout: ArrangeLayout) => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length < 2) return;
      if (!multiSameParentRef.current) return;
      const doc = docInAgocraftRef.current;
      const inputs = ids.flatMap((id) => {
        const item = findItemDeep(doc, id);
        if (item === undefined) return [];
        const f = (item.attrs as { frame?: ItemFrame }).frame;
        if (f === undefined) return [];
        // Pass rotation so rotated items arrange by their outer (AABB)
        // footprint and shrink to fit the assigned cell.
        return [
          { id, frame: { x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation } },
        ];
      });
      if (inputs.length < 2) return;
      // Pass the design pixel size so square cells are square ON SCREEN and the
      // rotated item's outer bounds are computed in pixel space (the design is
      // not 1:1, so ratio-space squares would render as aspect rectangles).
      const out = computeArrangedFrames(inputs, layout, design.width, design.height);
      const updates = out.flatMap((o, i) => {
        const prev = nn(inputs[i]).frame;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs capture live state.
  }, []);
  useEffect(() => {
    return setFrameDuplicator((frameId) => {
      // Stub: drop a fresh item of the same kind next to the hovered
      // one. Real copy-of-attrs duplication is a follow-up.
      // WI-156 / DR-112 — route through the command/patch path (was a direct
      // `rawAddItem` setter call that bypassed history + sync — the last live
      // patch-stream bypass).
      const kind = hoverContext.hoveredKind;
      if (kind === "none" || kind === "handle" || kind === "hotspot" || kind === "background")
        return;
      void frameId;
      editor.exec("weave.item.add", { kind: kind as DomainKind });
    });
  }, [editor, hoverContext.hoveredKind]);
  // WI-035 P2 — QuickActionBar "+" button on hovered frame. Inserts a
  // default-sized child frame directly without a sub-menu (single-
  // click affordance; tool hotkeys + drag-to-add tile cover other kinds).
  useEffect(() => {
    return setHoverFrameChildAdder((parentFrameId) => {
      const result = editor.exec<unknown, string>("weave.item.add", {
        kind: "frame",
        containerId: parentFrameId,
        frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      });
      if (result.ok) setSelectedFrameIdRef.current?.(result.value);
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

  // DR-027 / WI-071 Phase 2 — dialog handlers lifted out of the inline JSX so
  // the DesignDialogs view stays pure. Media confirm dispatches the fill / edit
  // / add mutation; slide-preset insert stages the subtree as one history entry.
  const mediaInitialSrc = (() => {
    if (!pendingMedia) return "";
    if (pendingMedia.action === "fill") return pendingMedia.initialSrc;
    if (pendingMedia.action === "edit") {
      if (!selectedFrameId) return "";
      // WI-072 — deep lookup so a media item INSIDE a frame resolves.
      const it = findItemDeep(docInAgocraft, selectedFrameId);
      if (!it || it.kind !== pendingMedia.kind) return "";
      return (it.attrs as { src?: string }).src ?? "";
    }
    return "";
  })();
  // WI-076 — prefill the caption field (image `alt`) when editing an image.
  const mediaInitialAlt = (() => {
    if (pendingMedia?.kind !== "image") return "";
    if (pendingMedia.action === "edit" && selectedFrameId) {
      const it = findItemDeep(docInAgocraft, selectedFrameId);
      if (it && it.kind === "image") return (it.attrs as { alt?: string }).alt ?? "";
    }
    return "";
  })();
  const handleMediaConfirm = (src: string, alt?: string) => {
    const pending = pendingMedia;
    setPendingMedia(null);
    if (!pending) return;
    if (pending.action === "fill") {
      // DR-028 — a shape's fill is the decoration.fill UNIT, set via
      // weave.item.setDecoration (not attrs.fill). cover fit matches Figma;
      // video defaults muted+loop to satisfy the autoplay policy.
      editor.exec("weave.item.setDecoration", {
        itemId: pending.itemId,
        kind: FILL_UNIT_KIND,
        attrs:
          pending.kind === "image"
            ? { type: "image", src, fit: "cover", opacity: 1 }
            : { type: "video", src, fit: "cover", muted: true, loop: true, opacity: 1 },
      });
      return;
    }
    if (pending.action === "edit") {
      if (!selectedFrameId) return;
      // WI-072 — deep lookup; a nested media item updates IN PLACE.
      const it = findItemDeep(docInAgocraft, selectedFrameId);
      if (it && it.kind === pending.kind) {
        editor.exec("weave.item.update", {
          itemId: selectedFrameId,
          patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
            // WI-076 — caption (alt) updates alongside src for image items.
            attrs: {
              ...prev.attrs,
              src,
              ...(alt !== undefined ? { alt } : {}),
            } as unknown as Readonly<Record<string, unknown>>,
          }),
        });
        return;
      }
      addNewItem(pending.kind, undefined, src, undefined, undefined, alt);
      return;
    }
    addNewItem(pending.kind, undefined, src, undefined, undefined, alt);
  };
  const handlePickPreset = (presetId: string) => {
    const result = editor.exec<unknown, string>("weave.preset.insertSlide", {
      presetId,
      containerId: String(docInAgocraft.root.id),
    });
    if (result.ok) setSelectedFrameIdRef.current?.(result.value);
  };

  // DR-027 / WI-071 Phase 2 — frame context-menu builder lifted out of the
  // FrameStage renderFrameMenu slot so the canvas JSX stays declarative.
  const renderFrameMenu = (
    itemId: string,
    children: ReactNodeAlias,
    ctx?: FrameMenuContext,
  ): ReactNodeAlias => {
    // WI-185 ⑯ — a PAGE (stage role) gets the empty-slide menu, not the
    // element menu: right-clicking the slide background is a context
    // gesture (Paste / New slide / 배경), never a structural-edit one.
    // Free-placement flavors never resolve "stage", so their root frames
    // keep the element menu unchanged.
    if (editorMode.roles.roleOf(docInAgocraft, itemId) === "stage") {
      return (
        <PageContextMenu
          itemId={itemId}
          pageNoun={pageNoun}
          onPaste={() => dispatchEditorCommand("weave.clipboard.paste", { editor }, commandContext)}
          pasteEnabled={clipboardCommands.hasItems}
          onNewPage={() => {
            // Same transaction as the rail "+" (WI-184 ⑩): the new page
            // slots right after the right-clicked one and becomes active.
            const r = editor.exec<unknown, string>("weave.page.add", { afterId: itemId });
            if (r.ok) {
              setSelectedFrameId(r.value);
              if (editorMode.rail.clickActivatesPage) setActivePageId(r.value);
            }
          }}
          onEditBackground={() => {
            // Selecting the page surfaces the contextual toolbar's frame-
            // background section (the WI-163 escape-hatch selection path).
            setSelectedFrameId(itemId);
          }}
        >
          {children}
        </PageContextMenu>
      );
    }
    // WI-039 — selection-aware reparent. The
    // gesture moves either the right-clicked
    // frame OR the multi-selection it belongs
    // to; cycle-blocked rows are dimmed.
    const movedIds: ReadonlyArray<string> =
      selectedIds.has(itemId) && selectedIds.size > 1 ? [...selectedIds] : [itemId];
    const reparentTree = buildFrameTree(docInAgocraft, movedIds);
    const handleReparent = (targetPickerId: string) => {
      const newParentId = resolvePickerTargetId(docInAgocraft, targetPickerId);
      // Ratio-font visual size is preserved by the command (WI-135 / DR-086).
      // Real design size keeps the rotation-aware reparent correct across
      // rotated, non-square ancestors.
      editor.exec("weave.item.reparent", {
        entries: movedIds.map((id) => ({ itemId: id, newParentId })),
        designWidth: design.width,
        designHeight: design.height,
      });
    };
    // WI-065 / DR-031 — shape ↔ line conversion. Gate each
    // row on the live item's convertibility (core decides).
    const cvItem = findItemDeep(docInAgocraft, itemId) as SerializedItem | undefined;
    const canBreak = cvItem !== undefined && canBreakShapeToLine(cvItem);
    const canClose = cvItem !== undefined && canCloseLineToShape(cvItem);
    // WI-185 ⑮ — standard element-menu rows. Group is capability-gated the
    // same way as the Cmd+G hotkey (pages/stages not movable; locked items
    // out); Ungroup mirrors Cmd+Shift+G but only for a movable frame so a
    // page can never be dissolved from the menu. Lock follows the DR-061
    // QuickActionBar semantics (lock ALL if any is unlocked, one undo).
    const groupableIds = movedIds.filter((id) => {
      if (!itemCapability(id).movable) return false;
      const it = findItemDeep(docInAgocraft, id);
      return !(it !== undefined && isItemLocked(it));
    });
    const canGroup = groupableIds.length >= 2;
    const canUngroup = cvItem?.kind === "frame" && itemCapability(itemId).movable;
    const anyUnlocked = movedIds.some((id) => {
      const it = findItemDeep(docInAgocraft, id);
      return !(it !== undefined && isItemLocked(it));
    });
    return (
      <FrameContextMenu
        itemId={itemId}
        onDelete={() => {
          removeItem(itemId);
          bumpHistoryTick();
        }}
        {...(canBreak
          ? {
              onBreakToLine: () => {
                const r = editor.exec<unknown, string>("weave.shape.breakToLine", { itemId });
                if (r.ok) selectFrame(r.value);
              },
            }
          : {})}
        {...(canClose
          ? {
              onCloseToShape: () => {
                const r = editor.exec<unknown, string>("weave.line.closeToShape", { itemId });
                if (r.ok) selectFrame(r.value);
              },
            }
          : {})}
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
            `weave.clipboard.${verb === "pasteSpecial" ? "pasteSpecial" : verb}`,
            { editor },
            commandContext,
          )
        }
        clipboardHasItems={clipboardCommands.hasItems}
        onDuplicate={() => {
          // Same selection-aware set as reparent; seeds the ⌘D rhythm so a
          // follow-up Cmd+D repeats the menu-made offset (WI-185 ⑬).
          const r = editor.exec<unknown, ReadonlyArray<string>>("weave.items.duplicate", {
            itemIds: movedIds,
          });
          if (r.ok && r.value.length > 0) {
            smartDuplicateRef.current = { sourceIds: movedIds, cloneIds: r.value };
            selectFrames(r.value);
          }
        }}
        {...(canGroup
          ? {
              onGroup: () => {
                const r = editor.exec<unknown, string>("weave.items.group", {
                  itemIds: groupableIds,
                  designWidth: design.width,
                  designHeight: design.height,
                });
                if (r.ok) selectFrames([r.value]);
              },
            }
          : {})}
        {...(canUngroup ? { onUngroup: () => dissolveFrame(itemId) } : {})}
        onToggleLock={() => {
          editor.runBatch(() => {
            for (const id of movedIds) {
              editor.exec("weave.item.update", { itemId: id, attrs: { locked: anyUnlocked } });
            }
          });
        }}
        locked={!anyUnlocked}
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
  };

  return (
    // WI-166 / DR-114 §2b — editor-mode composition root: resolves the
    // flavor to its composed policy context once; React consumers read
    // `useEditorMode()` / `useEditorModeRef()` instead of receiving a
    // flavor and branching.
    <EditorModeProvider flavor={currentFlavor}>
      <EditorVMProvider vm={vm}>
        <RouterProvider router={router}>
          <SelectionChromeProvider registry={selectionChrome}>
            <SelectionProvider vm={vm}>
              {/* WI-166 P4 — the FSM gate tables are per-flavor policy now;
                  the provider requires them so the hooks can never fall back
                  to a second hardcoded truth (DR-114 §6-G5). */}
              <InteractionModeProvider vm={vm} input={editorMode.input}>
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
                          <DatasetProvider doc={docInAgocraft} editor={editor}>
                            <ChartElementSelectionProvider>
                              <DesignDimsProvider width={design.width} height={design.height}>
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
                                  <DesignHeader
                                    designTitle={design.title}
                                    designId={designId}
                                    designBackground={design.background}
                                    panTools={editorMode.camera.dragPan}
                                    handMode={handMode}
                                    peekActive={peek.isActive}
                                    onSelectTool={() => {
                                      setHandMode(false);
                                      peek.deactivateSticky();
                                    }}
                                    onHandTool={() => {
                                      setHandMode(true);
                                      peek.deactivateSticky();
                                    }}
                                    onTogglePeek={peek.toggle}
                                    onOpenSlidePicker={() => setSlidePickerOpen(true)}
                                    pageNoun={pageNoun}
                                    onAddMedia={(kind) => setPendingMedia({ action: "add", kind })}
                                    onAddItem={addNewItem}
                                    onSetBackground={setDesignBackgroundViaEditor}
                                    onSave={() => void handleManualSave()}
                                    saveStatus={saveStatus}
                                    canExportSelection={selectedIds.size > 0}
                                    onExportSelection={exportImport.exportSelection}
                                    onImport={() => importInputRef.current?.click()}
                                  />
                                  {/* WI-089 — hidden importer. The File menu's
                            "가져오기" item triggers this; the change handler
                            reads + pastes the file then resets `value` so the
                            same file can be re-imported. */}
                                  <input
                                    ref={importInputRef}
                                    type="file"
                                    accept="application/json,.json"
                                    className="hidden"
                                    data-testid="import-file-input"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file !== undefined) void exportImport.importFile(file);
                                      e.target.value = "";
                                    }}
                                  />

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
                                    {exportImportInfo !== null && (
                                      <Banner
                                        tone="info"
                                        headline={exportImportInfo}
                                        onDismiss={() => setExportImportInfo(null)}
                                        dismissLabel="닫기"
                                        data-testid="export-import-info"
                                      />
                                    )}
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
                                        transform: peek.isActive
                                          ? "rotateX(12deg)"
                                          : "rotateX(0deg)",
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
                                            hoverSuppressedIds={hoverSuppressedIds}
                                          />
                                        )}
                                        background={design.background}
                                        root={docInAgocraft.root}
                                        document={docInAgocraft}
                                        editor={editor}
                                        editing={true}
                                        // WI-166 / DR-114 — injected policies
                                        // (FrameStage knows the interfaces only).
                                        roles={editorMode.roles}
                                        view={editorMode.view}
                                        camera={editorMode.camera}
                                        hit={editorMode.hit}
                                        fitInset={fitInset}
                                        handMode={handMode}
                                        // WI-033 P2 — enteredId / onEnter (drill-in mode,
                                        // Phase 12) removed. onFitAll restored: empty-canvas
                                        // double-click fits the camera to all items.
                                        selectedId={selectedFrameId ?? undefined}
                                        selectedIds={selectedIds}
                                        dimmedFrameIds={dimmedFrameIds}
                                        isolatedFrameIds={isolatedFrameIds}
                                        visibleFrameIds={visibleFrameIds}
                                        onSelect={setSelectedFrameId}
                                        onToggleSelect={(id) => toggleFrames([id])}
                                        onMarqueeSelect={onMarqueeSelect}
                                        onFitAll={handleFitAll}
                                        // WI-035 P3 — Toolbar drag-to-add. The
                                        // DropdownMenu add-items set the mime
                                        // `application/x-weave-add-kind` on
                                        // dragstart; FrameStage routes the drop's
                                        // `containerId` (root or hovered frame).
                                        // This handler dispatches the same
                                        // `weave.item.add` SSOT.
                                        onDragOver={(e) => {
                                          if (
                                            e.dataTransfer.types.includes(
                                              "application/x-weave-add-kind",
                                            )
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
                                          // WI-153 P4 (DR-111 D5) — page-bounded: an
                                          // empty-canvas drop arrives with the ROOT
                                          // containerId; retarget it to the active page
                                          // (root is page chrome there, not an editing
                                          // surface). Hovered-frame drops pass through.
                                          const target =
                                            containerId === String(docInAgocraft.root.id)
                                              ? (defaultAddContainerIdRef.current ?? containerId)
                                              : containerId;
                                          const result = editor.exec<unknown, string>(
                                            "weave.item.add",
                                            {
                                              kind,
                                              containerId: target,
                                              frame: {
                                                x: 0.3,
                                                y: 0.3,
                                                width: 0.4,
                                                height: 0.4,
                                                rotation: 0,
                                              },
                                            },
                                          );
                                          if (result.ok) setSelectedFrameId(result.value);
                                        }}
                                        onUpdateItem={handleUpdateItem}
                                        // WI-032 Phase 3b — onUpdateShape / onRemoveShape
                                        // edited `canvas-design.attrs.shapes[]`; with that
                                        // kind removed, shape primitives flow through
                                        // `onUpdateItem` instead.
                                        onCommitFrame={(itemId, nextFrame: ItemFrame) =>
                                          updateItem(itemId, (prev) => ({
                                            ...prev,
                                            attrs: {
                                              ...prev.attrs,
                                              frame: nextFrame,
                                            } as typeof prev.attrs,
                                          }))
                                        }
                                        renderFrameMenu={renderFrameMenu}
                                      />
                                    </div>

                                    {/* DR-027 / WI-071 — peek interaction surface (capture + overlay + inspector). */}
                                    <PeekCaptureLayer
                                      peek={peek}
                                      screenToDesign={screenToDesign}
                                      hitTestLifted={hitTestLifted}
                                      canvasHostRef={canvasHostRef}
                                      canvasHostEl={canvasHostEl}
                                      hostRect={hostRect}
                                      peekDragRef={peekDragRef}
                                      peekCursor={peekCursor}
                                      setPeekCursor={setPeekCursor}
                                      peekDraggingId={peekDraggingId}
                                      setPeekDraggingId={setPeekDraggingId}
                                      colorFor={swatchFor}
                                      labelFor={labelFor}
                                    />

                                    <SelectionToolbarOverlay
                                      editor={editor}
                                      document={docInAgocraft}
                                      selectedIds={selectedIds}
                                      onEditMediaSrc={(mediaKind) =>
                                        setPendingMedia({ action: "edit", kind: mediaKind })
                                      }
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

                                    {/* WI-028 Phase 4 — remote cursors overlay. `project` maps the
                  presence-broadcast design-space coords to host-relative
                  pixels so the SVG renders aligned to the local user's
                  viewport. The SVG itself is pointer-events:none — it
                  never intercepts the design surface gestures. */}
                                    {sync !== undefined ? (
                                      <PresenceCursors
                                        engine={sync.engine}
                                        project={designToHost}
                                      />
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
                                  {/* WI-166 / DR-114 §4 — the call site reads RailPolicy
                          and fills/empties the panel's declarative slots
                          ("no prop → no render"); the panel never sees the
                          policy. P2 behavior changes land here: mixed loses
                          the "+" add-page tile (addPage false); slide-deck /
                          doc-page lose the non-slide section, the deck
                          toggle and the focus eye. */}
                                  {editorMode.rail.visible &&
                                    typeof document !== "undefined" &&
                                    createPortal(
                                      <div
                                        ref={setRailEl}
                                        className="fixed inset-x-0 bottom-0 z-[46]"
                                      >
                                        <ThumbnailPanel
                                          design={design}
                                          // WI-194 / DR-127 — policy-filtered deck
                                          // order (page-bounded: root pages only;
                                          // the panel itself stays policy-free).
                                          deckOrder={presentationOrder}
                                          setPresentationOrder={setPresentationOrderViaEditor}
                                          selectedId={selectedFrameId}
                                          onSelect={(id) => {
                                            setSelectedFrameId(id);
                                            // WI-153 P2 — RailPolicy.clickActivatesPage:
                                            // a rail click switches the active page (the
                                            // canvas shows one page at a time).
                                            if (
                                              editorMode.rail.clickActivatesPage &&
                                              id !== undefined
                                            ) {
                                              setActivePageId(id);
                                            }
                                          }}
                                          focusedId={focusedId}
                                          focusStage={focusStage}
                                          disabledFrameIds={disabledFrameIds}
                                          // WI-039 focus eye — free placement only (a
                                          // single rendered page has nothing to dim).
                                          onCycleFocus={
                                            editorMode.rail.focusCycle
                                              ? handleCycleFocus
                                              : undefined
                                          }
                                          onClearFocus={
                                            editorMode.rail.focusCycle
                                              ? handleClearFocus
                                              : undefined
                                          }
                                          onZoomToFrame={handleZoomToFrame}
                                          // WI-072 deck toggle + non-slide section — same
                                          // free-placement-only policy pair.
                                          onToggleSlide={
                                            editorMode.rail.slideToggle
                                              ? toggleFrameSlide
                                              : undefined
                                          }
                                          showNonSlideSection={editorMode.rail.nonSlideSection}
                                          onAddPage={
                                            editorMode.rail.addPage
                                              ? () => {
                                                  // WI-153 P2 — add a blank page and make it
                                                  // the active page. WI-184 ⑩ — the command
                                                  // stamps kind/frame (FULL_FRAME lock) and
                                                  // slots the page right AFTER the current
                                                  // one in presentationOrder (5/5-tool
                                                  // consensus), one transaction.
                                                  const r = editor.exec<unknown, string>(
                                                    "weave.page.add",
                                                    { afterId: activePageId },
                                                  );
                                                  if (r.ok) {
                                                    setSelectedFrameId(r.value);
                                                    if (editorMode.rail.clickActivatesPage) {
                                                      setActivePageId(r.value);
                                                    }
                                                  }
                                                }
                                              : undefined
                                          }
                                          // WI-155 — page-bounded formats only (WI-153
                                          // 결정 6 scope): free placement keeps the
                                          // canvas-side duplicate (0.02 nudge) instead.
                                          // The command clones in place (offset 0) AND
                                          // inserts the clone after the source in
                                          // presentationOrder — one undo. The clone
                                          // becomes the active page (mirrors onAddPage).
                                          onDuplicatePage={
                                            editorMode.rail.duplicatePage
                                              ? (id) => {
                                                  const r = editor.exec<unknown, string>(
                                                    "weave.page.duplicate",
                                                    { itemId: id },
                                                  );
                                                  if (r.ok) {
                                                    setSelectedFrameId(r.value);
                                                    setActivePageId(r.value);
                                                  }
                                                }
                                              : undefined
                                          }
                                          // Per-page delete from the rail. Pick a
                                          // neighbor BEFORE removing so the active
                                          // page / selection never strands on the
                                          // deleted id (resolveActivePage would else
                                          // snap to page 1). The panel hides the
                                          // action on the last page, so ≥ 1 remains.
                                          onDeletePage={
                                            editorMode.rail.deletePage
                                              ? (id) => {
                                                  const order = presentationOrder;
                                                  const i = order.indexOf(id);
                                                  const neighbor =
                                                    i >= 0
                                                      ? (order[i + 1] ?? order[i - 1])
                                                      : undefined;
                                                  const r = editor.exec("weave.item.remove", {
                                                    itemId: id,
                                                  });
                                                  if (r.ok) {
                                                    if (selectedFrameId === id) {
                                                      setSelectedFrameId(neighbor);
                                                    }
                                                    if (
                                                      activePageId === id &&
                                                      neighbor !== undefined
                                                    ) {
                                                      setActivePageId(neighbor);
                                                    }
                                                  }
                                                }
                                              : undefined
                                          }
                                          // WI-184 ⑨ / WI-189 — rail multi-select
                                          // (Shift 범위 / Cmd 토글) + set ops, every
                                          // flavor; the panel stays policy-free.
                                          multiSelect={editorMode.rail.multiSelect}
                                          // Set duplicate: ONE transaction (each clone
                                          // slots right after its source); the LAST
                                          // clone becomes active (mirrors the single
                                          // duplicate's activate-the-clone).
                                          onDuplicatePages={
                                            editorMode.rail.duplicatePage
                                              ? (ids) => {
                                                  const r = editor.exec<
                                                    unknown,
                                                    ReadonlyArray<string>
                                                  >("weave.pages.duplicate", {
                                                    itemIds: ids,
                                                  });
                                                  if (r.ok) {
                                                    const last = r.value[r.value.length - 1];
                                                    if (last !== undefined) {
                                                      setSelectedFrameId(last);
                                                      setActivePageId(last);
                                                    }
                                                  }
                                                }
                                              : undefined
                                          }
                                          // Set delete: one weave.items.remove batch
                                          // (one undo). Neighbor pick = the first
                                          // surviving page at/after the first deleted
                                          // slot, else the last survivor — so the
                                          // active page never strands on a removed id.
                                          onDeletePages={
                                            editorMode.rail.deletePage
                                              ? (ids) => {
                                                  const order = presentationOrder;
                                                  const dead = new Set(ids);
                                                  const firstDeadIdx = order.findIndex((pid) =>
                                                    dead.has(pid),
                                                  );
                                                  const survivors = order.filter(
                                                    (pid) => !dead.has(pid),
                                                  );
                                                  const neighbor =
                                                    order.find(
                                                      (pid, i) =>
                                                        !dead.has(pid) && i > firstDeadIdx,
                                                    ) ?? survivors[survivors.length - 1];
                                                  const r = editor.exec("weave.items.remove", {
                                                    itemIds: [...ids],
                                                  });
                                                  if (r.ok) {
                                                    if (
                                                      selectedFrameId !== undefined &&
                                                      dead.has(selectedFrameId)
                                                    ) {
                                                      setSelectedFrameId(neighbor);
                                                    }
                                                    if (
                                                      activePageId !== undefined &&
                                                      dead.has(activePageId) &&
                                                      neighbor !== undefined
                                                    ) {
                                                      setActivePageId(neighbor);
                                                    }
                                                  }
                                                }
                                              : undefined
                                          }
                                          // WI-184 ⑪ / WI-189 — right-click rename /
                                          // skip-in-show, gated per row by the policy's
                                          // tileMenuRows set. Both ride weave.item.update
                                          // (attrs merge), so each is one undoable patch.
                                          onRenamePage={
                                            editorMode.rail.tileMenuRows.has("rename")
                                              ? (id, title) => {
                                                  editor.exec("weave.item.update", {
                                                    itemId: id,
                                                    attrs: { title },
                                                  });
                                                }
                                              : undefined
                                          }
                                          onToggleSkip={
                                            editorMode.rail.tileMenuRows.has("skipInShow")
                                              ? (id, skipped) => {
                                                  editor.exec("weave.item.update", {
                                                    itemId: id,
                                                    attrs: { skipped },
                                                  });
                                                }
                                              : undefined
                                          }
                                          // WI-185 ⑯ — tile-menu page lifecycle:
                                          // "새 페이지" inserts after THIS tile
                                          // (the "+" button inserts after the
                                          // ACTIVE page); "배경 변경" selects +
                                          // activates the page so the contextual
                                          // toolbar's background section shows.
                                          onAddPageAfter={
                                            editorMode.rail.addPage &&
                                            editorMode.rail.tileMenuRows.has("newPageAfter")
                                              ? (id) => {
                                                  const r = editor.exec<unknown, string>(
                                                    "weave.page.add",
                                                    { afterId: id },
                                                  );
                                                  if (r.ok) {
                                                    setSelectedFrameId(r.value);
                                                    if (editorMode.rail.clickActivatesPage) {
                                                      setActivePageId(r.value);
                                                    }
                                                  }
                                                }
                                              : undefined
                                          }
                                          onEditBackground={
                                            editorMode.rail.tileMenuRows.has("editBackground")
                                              ? (id) => {
                                                  setSelectedFrameId(id);
                                                  if (editorMode.rail.clickActivatesPage) {
                                                    setActivePageId(id);
                                                  }
                                                }
                                              : undefined
                                          }
                                        />
                                      </div>,
                                      document.body,
                                    )}
                                  {/* WI-052 — 아쿠 (Aku) assistant: floating launcher →
                          expandable chat panel. Mounted inside the providers so
                          its design-aware tools read live selection + edit via
                          editor.exec; self-portals to <body>. */}
                                  <AkuAssistant
                                    editor={editor}
                                    document={docInAgocraft}
                                    designId={designId}
                                    // WI-034 4b — gate Aku connect-on-init on the saved design
                                    // having loaded (load-order: a grace-replayed job edits the
                                    // real doc, not the blank placeholder shown while isLoading).
                                    designLoaded={!isLoading}
                                    designInfo={{
                                      width: design.width,
                                      height: design.height,
                                      background: design.background,
                                    }}
                                    // WI-153 P4 / WI-168 — page-bounded: feeds the agent
                                    // surface's host context (active page for mapInput +
                                    // promptFragment; same policy source as toolbar adds).
                                    defaultAddContainerId={defaultAddContainerId}
                                    // WI-168 (DR-115) — the flavor's agent command surface:
                                    // free placement = full pass-through, page-bounded =
                                    // closed allow-list with wrapped tools (weave.page.add).
                                    agentSurface={editorMode.agent}
                                    // WI-065 — after the agent adds slide(s), fit the deck
                                    // at the shared 70% (agent edits skip the UI add-fit).
                                    onFramesAdded={handleFitAll}
                                    // WI-169 — synchronous activation of a page the agent
                                    // CREATES (page.add/duplicate ok): rail-"+" parity, so
                                    // the agent's next add lands on its new page instead of
                                    // racing the debounced camera path onto the old one.
                                    onPageActivate={handleAgentPageActivate}
                                    // WI-125 — fit the camera to each NEW slide the agent
                                    // creates, at its creation moment. WI-153 P4 — the
                                    // agent wrapper also switches the active page on
                                    // page-bounded formats (hidden slides don't render).
                                    onZoomToFrame={handleAgentZoomToFrame}
                                  />
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
                                  {/* WI-070 — snap guide overlay (self-portals to body,
                          pointer-events:none). Renders the active snap's guides:
                          Phase 1 the endpoint-close radial marker; Phase 2 the
                          alignment / spacing / grid guide lines. */}
                                  <SnapFeedbackLayer />
                                  {/* WI-074 — rotation snap guide (0/90/180/270 crosshair
                          + degree badge) for both frame rotate and crop straighten. */}
                                  <RotationSnapLayer />
                                  {typeof document !== "undefined" &&
                                    layoutChildDrag.dropPreview !== null &&
                                    createPortal(
                                      <div
                                        className="layout-drop-cell-preview"
                                        style={{
                                          left: layoutChildDrag.dropPreview.left,
                                          top: layoutChildDrag.dropPreview.top,
                                          width: layoutChildDrag.dropPreview.width,
                                          height: layoutChildDrag.dropPreview.height,
                                        }}
                                      />,
                                      document.body,
                                    )}
                                  <DesignDialogs
                                    mediaOpen={pendingMedia !== null}
                                    mediaKind={pendingMedia?.kind ?? "image"}
                                    mediaInitialSrc={mediaInitialSrc}
                                    mediaInitialAlt={mediaInitialAlt}
                                    onMediaConfirm={handleMediaConfirm}
                                    onMediaCancel={() => setPendingMedia(null)}
                                    pasteSpecialOpen={clipboardCommands.pasteSpecialOpen}
                                    onPasteSpecialOpenChange={clipboardCommands.setPasteSpecialOpen}
                                    onPasteSpecialConfirm={
                                      clipboardCommands.handlePasteSpecialConfirm
                                    }
                                    clipboardHasItems={clipboardCommands.hasItems}
                                    hasSelection={selectedIds.size > 0}
                                    conflictOpen={localConflict}
                                    conflictBusy={conflictBusy}
                                    onConflictSave={() => void handleConflictSave()}
                                    onConflictDiscard={() => void handleConflictDiscard()}
                                    slidePickerOpen={slidePickerOpen}
                                    onSlidePickerOpenChange={setSlidePickerOpen}
                                    onPickPreset={handlePickPreset}
                                    pageNoun={pageNoun}
                                    paletteOpen={paletteOpen}
                                    onPaletteOpenChange={setPaletteOpen}
                                  />
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
                                    // WI-164 — no quick actions on a page
                                    // (artboard): the escape-hatch selection
                                    // keeps ONLY the contextual toolbar
                                    // (page-fill editing); insert/lock/delete
                                    // are item actions a page never takes.
                                    selectedFrameId={
                                      selectedFrameId != null &&
                                      itemCapability(selectedFrameId).quickActions
                                        ? selectedFrameId
                                        : undefined
                                    }
                                    selectedIds={selectedIds}
                                    onInsertInFrame={(containerId, kind, options) => {
                                      // WI-036 follow-up / WI-044 — hover-open
                                      // two-level submenu of the `+` button. Shares
                                      // the same `weave.item.add` SSOT as the hotkey
                                      // / Alt+drag / DropdownMenu add paths.
                                      //
                                      // The bar is selection-driven: after the
                                      // submenu inserts a child we deliberately
                                      // KEEP the parent selected (don't follow
                                      // the new item) so the bar stays anchored
                                      // to the same frame and the user can add
                                      // multiple children in a row.

                                      // Image / video have no inline type variant —
                                      // they open the media picker (same dialog the
                                      // top toolbar uses). The picker's confirm path
                                      // adds into the selected frame, which is this
                                      // anchored bar's target.
                                      if (kind === "image" || kind === "video") {
                                        setPendingMedia({ action: "add", kind });
                                        return;
                                      }
                                      const attrsOverride: Record<string, unknown> = {};
                                      const sub = options?.shapeSubKind;
                                      if (kind === "shape" && sub && sub !== "rectangle") {
                                        attrsOverride.shape = sub;
                                        attrsOverride.subAttrs =
                                          options?.subAttrs ?? defaultShapeSubAttrs(sub);
                                      }
                                      if (kind === "line" && options?.lineAttrs) {
                                        attrsOverride.points = options.lineAttrs.points;
                                        if (options.lineAttrs.smooth !== undefined) {
                                          attrsOverride.smooth = options.lineAttrs.smooth;
                                        }
                                        attrsOverride.heads = { start: "none", end: "none" };
                                      }
                                      // WI-044 — frame layout paradigm. "absolute" is
                                      // the default (no spec); flex/grid attach the spec
                                      // at creation time via attrsOverride. A follow-up
                                      // `weave.frame.setLayout` would race the
                                      // PendingCreations staging pipeline (the new item
                                      // isn't in ctx.document until the next tick, so
                                      // findChild would miss it) — and a brand-new frame
                                      // has no children to re-place, so setting the raw
                                      // attrs.layout is sufficient; the onChildAdd hook
                                      // handles placement once children arrive.
                                      const layout = options?.frameLayout;
                                      if (
                                        kind === "frame" &&
                                        layout !== undefined &&
                                        layout !== "absolute"
                                      ) {
                                        const spec: LayoutSpec =
                                          layout === "auto-flex"
                                            ? createAutoFlexSpec()
                                            : createAutoGridSpec({
                                                columns: [trackFr(1)],
                                                rows: [trackFr(1)],
                                              });
                                        attrsOverride.layout = spec;
                                      }
                                      editor.exec<unknown, string>("weave.item.add", {
                                        kind,
                                        containerId,
                                        frame: {
                                          x: 0.3,
                                          y: 0.3,
                                          width: 0.4,
                                          height: 0.4,
                                          rotation: 0,
                                        },
                                        ...(Object.keys(attrsOverride).length > 0
                                          ? { attrsOverride }
                                          : {}),
                                      });
                                    }}
                                    onArrangeHover={setArrangePreview}
                                    isLocked={(id) => {
                                      const it = findItemDeep(docInAgocraft, id);
                                      return it !== undefined && isItemLocked(it);
                                    }}
                                  />
                                  {/* WI-048 — ghost preview of the Flex / Grid
                              arrangement while the bar button is hovered. */}
                                  <ArrangePreviewOverlay
                                    layout={arrangePreview}
                                    selectedIds={selectedIds}
                                    doc={docInAgocraft}
                                    designWidth={design.width}
                                    designHeight={design.height}
                                  />
                                </div>
                              </DesignDimsProvider>
                            </ChartElementSelectionProvider>
                          </DatasetProvider>
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
    </EditorModeProvider>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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
  /** WI-164 / WI-166 — hover-suppressed ids, computed from RolePolicy at the
   *  composition root (stage items; empty on infinite canvas). The projector
   *  paints NO affordance for them — see projector docs. */
  readonly hoverSuppressedIds: ReadonlySet<string>;
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
  hoverSuppressedIds,
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
        hoverSuppressedIds,
      }),
    [doc, hoveredKind, hoveredId, designWidth, designHeight, selectedIds, hoverSuppressedIds],
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

// WI-044 — two-level "+" add menu. The first depth is the item kind
// (frame / text / image / video / shape); the second depth is the
// per-kind type variant — frame layout paradigm (absolute / flex /
// grid) or shape sub-kind. `AddItemOptions` carries the chosen variant
// so the host's single `weave.item.add` dispatch can compose the right
// attrs + follow-up `weave.frame.setLayout`.
type FrameLayoutChoice = "absolute" | "auto-flex" | "auto-grid";

interface AddItemOptions {
  readonly shapeSubKind?: ShapeSubKind;
  readonly frameLayout?: FrameLayoutChoice;
  /** Seed an explicit shape subAttrs (e.g. an OPEN `poly` for the freeform
   *  line) instead of the kind's closed default. Shapes only. */
  readonly subAttrs?: ReturnType<typeof defaultShapeSubAttrs>;
  /** Seed `line` kind attrs (points + optional smooth). `line` kind only. */
  readonly lineAttrs?: LineSeed;
}

// WI-048 — ghost preview of the multi-select Flex / Grid arrange. Computes the
// projected positions with the SAME pure `computeArrangedFrames` the apply
// path uses, then renders translucent ghost rects. Projection: derive the
// common parent's on-screen rect from the first selected item's DOM rect + its
// parent-ratio frame, then map each arranged (parent-ratio) frame to px. No
// dependency on the parent element existing in the DOM (works for root + nested
// parents alike).
interface ArrangePreviewOverlayProps {
  readonly layout: ArrangeLayout | null;
  readonly selectedIds: ReadonlySet<string>;
  readonly doc: AgocraftDocument;
  readonly designWidth: number;
  readonly designHeight: number;
}

function ArrangePreviewOverlay({
  layout,
  selectedIds,
  doc,
  designWidth,
  designHeight,
}: ArrangePreviewOverlayProps): React.ReactElement | null {
  const ghosts = useMemo<
    ReadonlyArray<{ left: number; top: number; width: number; height: number }>
  >(() => {
    if (layout === null || selectedIds.size < 2) return [];
    const inputs = Array.from(selectedIds).flatMap((id) => {
      const item = findItemDeep(doc, id);
      if (item === undefined) return [];
      const f = (item.attrs as { frame?: ItemFrame }).frame;
      if (f === undefined) return [];
      return [
        { id, frame: { x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation } },
      ];
    });
    if (inputs.length < 2) return [];
    // A frame's axis-aligned OUTER bounds in RATIO space, but with the AABB
    // computed in PIXELS (rotation is isotropic in pixels, not in the
    // non-square ratio space) and converted back — so the ghost matches the
    // on-screen bound of a rotated item.
    const W = designWidth > 0 ? designWidth : 1;
    const H = designHeight > 0 ? designHeight : 1;
    const aabbOf = (f: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
    }) => {
      const rot = f.rotation ?? 0;
      const c = Math.abs(Math.cos(rot));
      const s = Math.abs(Math.sin(rot));
      const wPx = f.width * W;
      const hPx = f.height * H;
      const w = (wPx * c + hPx * s) / W;
      const h = (wPx * s + hPx * c) / H;
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;
      return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
    };
    // Parent on-screen rect from the first child's DOM rect (= that child's
    // AABB) and its AABB ratio, so the scale is correct even when the first
    // selected item is rotated.
    const first = nn(inputs[0]);
    const el = document.querySelector(`[data-frame-id="${CSS.escape(first.id)}"]`);
    if (!(el instanceof HTMLElement)) return [];
    const cr = el.getBoundingClientRect();
    const firstAabb = aabbOf(first.frame);
    if (firstAabb.width <= 0 || firstAabb.height <= 0) return [];
    const pw = cr.width / firstAabb.width;
    const ph = cr.height / firstAabb.height;
    const pLeft = cr.left - firstAabb.left * pw;
    const pTop = cr.top - firstAabb.top * ph;
    // Each ghost shows the item's resulting OUTER bounds (the cell it fills) —
    // for a rotated item that's its AABB, not the smaller raw box.
    return computeArrangedFrames(inputs, layout, W, H).map((o) => {
      const ab = aabbOf(o.frame);
      return {
        left: pLeft + ab.left * pw,
        top: pTop + ab.top * ph,
        width: ab.width * pw,
        height: ab.height * ph,
      };
    });
  }, [layout, selectedIds, doc, designWidth, designHeight]);

  if (ghosts.length === 0) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[47]" data-testid="arrange-preview-overlay">
      {ghosts.map((g) => (
        <div
          key={`${Math.round(g.left)}-${Math.round(g.top)}-${Math.round(g.width)}`}
          className="absolute rounded-[var(--radius-sm)] border-2 border-dashed border-[color:var(--arrange-preview-stroke)] bg-[color:var(--arrange-preview-fill)]"
          style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
        />
      ))}
    </div>,
    document.body,
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
   *  lists every domain × type-variant add and dispatches through this
   *  callback (which routes the same `weave.item.add` SSOT all other
   *  paths use, plus a follow-up `weave.frame.setLayout` for flex/grid
   *  frames, and the media picker for image/video). Receives the
   *  container frame id from the anchored bar's current target. */
  readonly onInsertInFrame: (
    containerId: string,
    kind: DomainKind,
    options?: AddItemOptions,
  ) => void;
  /** WI-048 — hovering the multi-select Flex / Grid button previews the
   *  arrangement. `null` clears the preview. The host renders the ghost
   *  overlay (it owns the doc + projection). */
  readonly onArrangeHover: (layout: ArrangeLayout | null) => void;
  /** DR-061 — live `locked` read for the lock/unlock toggle glyph. */
  readonly isLocked: (itemId: string) => boolean;
}

function QuickActionBarAnchored({
  selectedFrameId,
  selectedIds,
  onInsertInFrame,
  onArrangeHover,
  isLocked,
}: QuickActionBarAnchoredProps): React.ReactElement | null {
  // WI-040 — affordance gate. The QuickActionBar is a hover/selection
  // affordance and must stand down whenever something else owns the
  // canvas: peek inspector active, context-menu (LayerPicker) open,
  // hand/pan armed, rubber-band drawing, text editing in flight, or a
  // frame mid-drag. `useEditAffordancesAllowed` is the single-source
  // boolean for this — same gate the upcoming HoverAffordanceLayer
  // (Phase 3) will share.
  const affordancesAllowed = useEditAffordancesAllowed();
  // WI-074 D8b — while cropping, the bar shows ONLY the crop apply/cancel commands.
  const cropping = useIsCropping();
  const isMulti = selectedIds.size > 1;
  const [anchor, setAnchor] = useState<{ top: number; left: number; frameId: string } | null>(null);
  // Stable key for the multi-select case so the effect re-mounts
  // whenever the selection set changes (sorted ids joined).
  const multiKey = useMemo(
    () => (isMulti ? Array.from(selectedIds).sort().join("|") : ""),
    [isMulti, selectedIds],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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
      const tagId = isMulti ? (ids[0] ?? "multi") : nn(ids[0]);
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
        // WI-074 D8b — during a crop, filter to the "crop" category so only the
        // 완료 / 취소 commands surface (the normal frame actions are suppressed).
        {...(cropping ? { category: "crop" } : {})}
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
          // WI-074 D8b — crop 완료 / 취소.
          if (id === "crop.apply") {
            return (
              <CommandIconButton commandId={id} size="sm">
                <IconCheck size={15} />
              </CommandIconButton>
            );
          }
          if (id === "crop.cancel") {
            return (
              <CommandIconButton commandId={id} size="sm">
                <IconClose size={14} />
              </CommandIconButton>
            );
          }
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
          // WI-048 — multi-select "arrange into Flex / Grid". Hover previews
          // the arrangement (ghost overlay), click applies it.
          if (id === "multi.layout-flex" || id === "multi.layout-grid") {
            const layout: ArrangeLayout = id === "multi.layout-flex" ? "flex" : "grid";
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus handled by dedicated controls elsewhere
              <span
                onMouseEnter={() => onArrangeHover(layout)}
                onMouseLeave={() => onArrangeHover(null)}
              >
                <CommandIconButton commandId={id} size="sm" onClick={() => onArrangeHover(null)}>
                  {layout === "flex" ? <IconLayoutFlex size={15} /> : <IconLayoutGrid size={15} />}
                </CommandIconButton>
              </span>
            );
          }
          // DR-design-016 Phase 2 — duplicate the selection.
          if (id === "item.duplicate") {
            return (
              <CommandIconButton commandId={id} size="sm">
                <IconCopy size={14} />
              </CommandIconButton>
            );
          }
          // DR-061 — lock / unlock toggle; glyph reflects the live state.
          if (id === "item.toggleLock") {
            const locked = isLocked(anchor.frameId);
            return (
              <CommandIconButton commandId={id} size="sm">
                {locked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
              </CommandIconButton>
            );
          }
          const glyphNode =
            id === "frame.delete" || id === "multi.delete" ? (
              <IconClose size={14} />
            ) : id === "frame.removeKeepingChildren" ? (
              <IconUngroup size={15} />
            ) : id === "image.replaceSrc" || id === "video.replaceSrc" ? (
              <IconRefresh size={14} />
            ) : id === "frame.toggleSlide" ? (
              <IconLayers size={15} />
            ) : (
              <span className="inline-block h-1 w-1 rounded-full bg-current" />
            );
          return (
            <CommandIconButton commandId={id} size="sm">
              {glyphNode}
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus are handled by dedicated controls elsewhere */}
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
  readonly onInsert: (containerId: string, kind: DomainKind, options?: AddItemOptions) => void;
}

// WI-044 — shape sub-kind rows for the "도형" second-depth flyout. One
// entry per offered `ShapeSubKind`, each with its design-system icon
// (icons-only rule — the previous inline emoji glyphs are retired).
const SHAPE_VARIANT_ROWS: ReadonlyArray<{
  readonly subKind: ShapeSubKind;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly testid?: string;
}> = [
  {
    subKind: "rectangle",
    label: "사각형",
    icon: <IconShapeRectangle size={16} />,
    testid: "frame-add-shape-rectangle",
  },
  {
    subKind: "ellipse",
    label: "원",
    icon: <IconShapeEllipse size={16} />,
    testid: "frame-add-shape-ellipse",
  },
  { subKind: "arrow", label: "화살표", icon: <IconShapeArrow size={16} /> },
  { subKind: "triangle", label: "삼각형", icon: <IconShapeTriangle size={16} /> },
  { subKind: "star", label: "별", icon: <IconShapeStar size={16} /> },
  { subKind: "polygon", label: "다각형", icon: <IconShapePolygon size={16} /> },
  { subKind: "poly", label: "자유 다각형", icon: <IconShapePoly size={16} /> },
  { subKind: "heart", label: "하트", icon: <IconShapeHeart size={16} /> },
  { subKind: "speech-bubble", label: "말풍선", icon: <IconShapeSpeechBubble size={16} /> },
];

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

  const insert = (kind: DomainKind, options?: AddItemOptions): void => {
    onInsert(frameId, kind, options);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus are handled by dedicated controls elsewhere */}
      <span onMouseEnter={handleEnter} onMouseLeave={scheduleClose}>
        <DropdownMenuTrigger asChild>
          <CommandIconButton commandId="frame.addChild" size="sm">
            <IconPlus size={15} />
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
        {/* 프레임 — first depth; hover opens layout-paradigm flyout,
            direct click adds a default (absolute) frame. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            icon={<IconFrame size={16} />}
            data-testid="frame-add-frame"
            onClick={() => insert("frame", { frameLayout: "absolute" })}
          >
            프레임
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            onMouseEnter={handleEnter}
            onMouseLeave={scheduleClose}
            data-testid="frame-add-frame-submenu"
          >
            <DropdownMenuItem
              icon={<IconLayoutAbsolute size={16} />}
              onSelect={() => insert("frame", { frameLayout: "absolute" })}
              data-testid="frame-add-frame-absolute"
            >
              Absolute
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconLayoutFlex size={16} />}
              onSelect={() => insert("frame", { frameLayout: "auto-flex" })}
              data-testid="frame-add-frame-flex"
            >
              Flex
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconLayoutGrid size={16} />}
              onSelect={() => insert("frame", { frameLayout: "auto-grid" })}
              data-testid="frame-add-frame-grid"
            >
              Grid
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* 텍스트 / 이미지 / 비디오 — first depth, no type variant.
            Image/video route to the media picker via the host handler. */}
        <DropdownMenuItem
          icon={<IconText size={16} />}
          onSelect={() => insert("text")}
          data-testid="frame-add-text"
        >
          텍스트
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<IconImage size={16} />}
          onSelect={() => insert("image")}
          data-testid="frame-add-image"
        >
          이미지
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<IconVideo size={16} />}
          onSelect={() => insert("video")}
          data-testid="frame-add-video"
        >
          비디오
        </DropdownMenuItem>

        {/* 도형 — first depth; hover opens shape-variant flyout, direct
            click adds a default rectangle. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            icon={<IconShape size={16} />}
            data-testid="frame-add-shape"
            onClick={() => insert("shape", { shapeSubKind: "rectangle" })}
          >
            도형
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            onMouseEnter={handleEnter}
            onMouseLeave={scheduleClose}
            data-testid="frame-add-shape-submenu"
          >
            {SHAPE_VARIANT_ROWS.map((row) => (
              <DropdownMenuItem
                key={row.subKind}
                icon={row.icon}
                onSelect={() => insert("shape", { shapeSubKind: row.subKind })}
                {...(row.testid !== undefined ? { "data-testid": row.testid } : {})}
              >
                {row.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* 선 — separate from 도형: 직선 (line) + 자유선 (open poly / polyline). */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            icon={<IconShapeLine size={16} />}
            data-testid="frame-add-line"
            onClick={() => insert("line", { lineAttrs: LINE_STRAIGHT })}
          >
            선
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            onMouseEnter={handleEnter}
            onMouseLeave={scheduleClose}
            data-testid="frame-add-line-submenu"
          >
            <DropdownMenuItem
              icon={<IconShapeLine size={16} />}
              onSelect={() => insert("line", { lineAttrs: LINE_STRAIGHT })}
              data-testid="frame-add-line-straight"
            >
              직선
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconPencil size={16} />}
              onSelect={() => insert("line", { lineAttrs: LINE_FREE })}
              data-testid="frame-add-line-free"
            >
              자유선
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconShapeLine size={16} />}
              onSelect={() => insert("line", { lineAttrs: LINE_CURVE })}
              data-testid="frame-add-line-curve"
            >
              곡선
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<IconPencil size={16} />}
              onSelect={() => insert("line", { lineAttrs: LINE_CURVE_FREE })}
              data-testid="frame-add-line-curve-free"
            >
              자유곡선
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
