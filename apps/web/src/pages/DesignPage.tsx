import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  defaultShapeSubAttrs,
  type ShapeSubKind,
} from "@agocraft/core";
import { EditorProvider, useEditorVM } from "@agocraft/editor/react";
import {
  AITooltip,
  type AITooltipHotkeyTable,
  AITooltipProvider,
  Button,
  CommandHostProvider,
  CommandIconButton,
  CommandPalette,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  IconCursor,
  IconHand,
  IconLayers,
  IconPlay,
  IconPlus,
  IconRedo,
  IconUndo,
  QuickActionBar,
  ThemeSwitcher,
} from "@weave/design-system";
import type { ReactNode as ReactNodeAlias } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type DocFlavor,
  type DomainKind,
  firstChildOf,
  InteractionModeProvider,
  type ItemFrame,
  nextSiblingOf,
  parentOf,
  prevSiblingOf,
  SelectionProvider,
  useDesign,
  useInteractionMode,
  useSelection,
  useTooltipsAllowed,
} from "../document";
import { EditorVMProvider } from "../document/interactions/editor-vm-context.js";
import { RouterProvider } from "../document/interactions/router-context.js";
import { SelectionChromeProvider } from "../document/interactions/selection-chrome-context.js";
import { useHoverContext } from "../document/interactions/use-hover-context.js";
import {
  findFramesAtPoint,
  type LayerHit,
  LayerPickerMenu,
} from "../document/layer-picker/index.js";
import { PeekOverlay, PointStackInspector, usePeekMode } from "../document/peek-mode/index.js";
import { PresenceCursors } from "../document/presence/PresenceCursors.js";
import { usePresenceLocalCursor } from "../document/presence/use-presence-local-cursor.js";
import { createSlideBulletHandleViewModel } from "../document/selection-chrome/slide-bullet-handle.js";
import { ContextualToolbar } from "../document/toolbar/ContextualToolbar.js";
import { MediaSrcDialog } from "../document/toolbar/MediaSrcDialog.js";
import { CursorTooltip } from "../document/tooltip/CursorTooltip.js";
import {
  dispatchEditorCommand,
  editorCommandMetadata,
  type ItemAdderKind,
  type SelectionNavDir,
  setFrameDeleter,
  setMultiDeleter,
  setFrameDuplicator,
  setHoverFrameChildAdder,
  setItemAdder,
  setMediaSrcOpener,
  setPaletteOpener,
  setSelectionNavigator,
  useEditorHotkeys,
} from "../document/tooltip/editor-hotkeys.js";
import { useWeaveEditor } from "../document/use-weave-editor.js";
import { registerZOrderAdapters } from "../document/zorder/register.js";
import { FigmaSelectionLaunchBanner } from "../launch/FigmaSelectionLaunchBanner.js";
import { TextV1LaunchBanner } from "../launch/TextV1LaunchBanner.js";
import { FrameStage } from "./FrameStage.js";
import { SlidePresetPicker } from "./new-design/SlidePresetPicker.js";
import { ThumbnailPanel } from "./ThumbnailPanel.js";

/** AITooltipProvider that mirrors the editor-wide interaction mode. Reads
 *  `useTooltipsAllowed()` from the InteractionMode machine and passes its
 *  inverse as `disabled` so the design-system provider doesn't need to know
 *  about the host's mode enum. Lives here so the provider's hook reads the
 *  same context that NestedFrame / useRubberBand publish into. */
function ModeAwareAITooltipProvider({
  children,
  hotkeyTable,
}: {
  readonly children: ReactNodeAlias;
  readonly hotkeyTable: AITooltipHotkeyTable;
}) {
  const tooltipsAllowed = useTooltipsAllowed();
  return (
    <AITooltipProvider scan="dataset" hotkeyTable={hotkeyTable} disabled={!tooltipsAllowed}>
      {children}
    </AITooltipProvider>
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
  children,
  layers,
  onPickLayer,
  onHoverPreview,
}: {
  readonly itemId: string;
  readonly onDelete: () => void;
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

  // WI-019 Phase 3 — Peek mode controller + cursor → design coord translation.
  const peek = usePeekMode({
    design,
    subscribeToChanges: (h) => editor.changeStream.subscribe(h),
    onReorderRoot: reorderRootChildrenViaEditor,
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
    for (let i = liftSet.orderedIds.length - 1; i >= 0; i -= 1) {
      const id = liftSet.orderedIds[i];
      if (id === undefined) continue;
      const item = docInAgocraft.root.children.find((c) => String(c.id) === id);
      if (!item) continue;
      const frame = (
        item.attrs as { frame?: { x: number; y: number; width: number; height: number } }
      ).frame;
      if (!frame) continue;
      const x = frame.x * design.width;
      const y = frame.y * design.height;
      const w = frame.width * design.width;
      const h = frame.height * design.height;
      if (designX >= x && designX <= x + w && designY >= y && designY <= y + h) {
        return id;
      }
    }
    return null;
  }

  // labelFor / swatchFor — feed Inspector with meaningful labels.
  const labelFor = useCallback(
    (id: string) => {
      const it = docInAgocraft.root.children.find((c) => String(c.id) === id);
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
      const containerId =
        selectedFrameIdRef.current ?? String(docInAgocraft.root.id);
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

  // WI-030 — Slide preset picker open state. The Add menu's "슬라이드" item
  // opens this dialog instead of immediately inserting a blank slide.
  const [slidePickerOpen, setSlidePickerOpen] = useState(false);

  const swatchFor = useCallback(
    (id: string) => {
      const it = docInAgocraft.root.children.find((c) => String(c.id) === id);
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
              <CommandHostProvider
                registry={editorCommandMetadata}
                context={commandContext}
                locale="ko"
                dispatch={dispatchCommand}
              >
                <ModeAwareAITooltipProvider hotkeyTable={editorHotkeyTable}>
                  <EditorProvider editor={editor}>
                    <div className="fixed inset-0 flex flex-col bg-[color:var(--bg-page)]">
                      <header
                        className="relative z-20 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-3 md:px-4 h-12 border-b border-[color:var(--surface-1-border)] bg-[color:var(--surface-1)]"
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
                              <AITooltip context="선택" actions={[{ action: "V" }]}>
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
                                  className={
                                    !handMode && !peek.isActive
                                      ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                                      : undefined
                                  }
                                >
                                  <IconCursor />
                                </IconButton>
                              </AITooltip>
                              <AITooltip context="이동" actions={[{ action: "H / Space" }]}>
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
                                  className={
                                    handMode && !peek.isActive
                                      ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                                      : undefined
                                  }
                                >
                                  <IconHand />
                                </IconButton>
                              </AITooltip>
                              <AITooltip
                                context="Z-순서 보기"
                                actions={[{ action: "L (홀드) · 클릭 고정" }]}
                              >
                                <IconButton
                                  aria-label="Peek z-order"
                                  aria-pressed={peek.isActive}
                                  size="sm"
                                  onClick={peek.toggle}
                                  data-testid="toolbar-peek"
                                  data-active={peek.isActive ? "true" : undefined}
                                  className={
                                    peek.isActive
                                      ? "text-[color:var(--text-strong)] bg-[color:var(--surface-2)]"
                                      : undefined
                                  }
                                >
                                  <IconLayers />
                                </IconButton>
                              </AITooltip>
                              <span
                                aria-hidden
                                className="inline-block w-px h-4 bg-[color:var(--surface-1-border)] mx-1.5"
                              />
                            </>
                          ) : null}
                          {/* WI-020 — Add menu: image / video / 9 shape sub-kinds */}
                          <DropdownMenu>
                            <AITooltip
                              context="추가"
                              actions={[{ action: "이미지 · 비디오 · 도형" }]}
                            >
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  aria-label="Add new item"
                                  size="sm"
                                  data-testid="toolbar-add"
                                >
                                  <IconPlus />
                                </IconButton>
                              </DropdownMenuTrigger>
                            </AITooltip>
                            <DropdownMenuContent align="start" sideOffset={6}>
                              <DropdownMenuLabel>슬라이드</DropdownMenuLabel>
                              <DropdownMenuItem
                                onSelect={() => setSlidePickerOpen(true)}
                                data-testid="add-slide"
                              >
                                ▭&nbsp;&nbsp;슬라이드 시작점…
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>미디어</DropdownMenuLabel>
                              <DropdownMenuItem
                                onSelect={() => setPendingMedia({ action: "add", kind: "image" })}
                                data-testid="add-image"
                              >
                                이미지
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPendingMedia({ action: "add", kind: "video" })}
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
                                  e.dataTransfer.setData("application/x-weave-add-kind", "text");
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
                                  e.dataTransfer.setData("application/x-weave-add-kind", "shape");
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
                          <ThemeSwitcher />
                          <Button size="md" trailingIcon={<IconPlay size={14} />} asChild>
                            <Link
                              to={`/design/${designId}/present`}
                              data-testid="toolbar-present"
                              data-ai-tooltip="true"
                              data-tooltip-context="프레젠테이션"
                              data-tooltip-actions='[{"action":"풀스크린 발표"}]'
                            >
                              Present
                            </Link>
                          </Button>
                        </div>
                      </header>

                      {/* WI-029 R5 + WI-033 P3 — text item v1 +
                          Figma frame selection launch announcements
                          (LG-001 / RISK-001 #6 + RISK-005 #5). Both
                          auto-show during the launch week and fall
                          silent on dismiss / outside the window. */}
                      <div className="px-4 pt-2 flex flex-col gap-2">
                        <TextV1LaunchBanner />
                        <FigmaSelectionLaunchBanner />
                      </div>

                      <main
                        className="relative flex-1 overflow-hidden"
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
                              if (e.dataTransfer.types.includes("application/x-weave-add-kind")) {
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
                            renderFrameMenu={(itemId, children, ctx) => (
                              <FrameContextMenu
                                itemId={itemId}
                                onDelete={() => {
                                  removeItem(itemId);
                                  bumpHistoryTick();
                                }}
                                {...(ctx !== undefined
                                  ? {
                                      layers: ctx.layers,
                                      onPickLayer: ctx.onPickLayer,
                                    }
                                  : {})}
                              >
                                {children}
                              </FrameContextMenu>
                            )}
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
                  centered above the canvas while items are selected. The
                  design-background (no-selection) variant was earlier
                  auto-mounted in the top-right corner, but it intercepted
                  clicks on FULL_FRAME frame content (e.g., a slide title
                  that spans the canvas width). For now, mount only when
                  something is selected; design-level background editing
                  is reachable via the frame Background section once a
                  frame is selected, or as a follow-up that opens the
                  picker explicitly. */}
                        {!peek.isActive && selectedIds.size > 0 ? (
                          <div
                            style={{
                              position: "absolute",
                              top: 12,
                              left: "50%",
                              transform: "translateX(-50%)",
                              zIndex: 35,
                              pointerEvents: "auto",
                            }}
                          >
                            <ContextualToolbar
                              editor={editor}
                              selectedItems={(() => {
                                const out: Array<{
                                  id: string;
                                  kind: string;
                                  attrs: Readonly<Record<string, unknown>>;
                                }> = [];
                                for (const c of docInAgocraft.root.children) {
                                  if (selectedIds.has(String(c.id))) {
                                    out.push({
                                      id: String(c.id),
                                      kind: c.kind,
                                      attrs: c.attrs,
                                    });
                                  }
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
                              designBackground={design.background}
                              onChangeDesignBackground={setDesignBackgroundViaEditor}
                            />
                          </div>
                        ) : null}

                        {/* WI-028 Phase 4 — remote cursors overlay. `project` maps the
                  presence-broadcast design-space coords to host-relative
                  pixels so the SVG renders aligned to the local user's
                  viewport. The SVG itself is pointer-events:none — it
                  never intercepts the design surface gestures. */}
                        {sync !== undefined ? (
                          <PresenceCursors engine={sync.engine} project={designToHost} />
                        ) : null}
                      </main>

                      <ThumbnailPanel
                        design={design}
                        setPresentationOrder={setPresentationOrderViaEditor}
                        selectedId={selectedFrameId}
                        onSelect={setSelectedFrameId}
                      />
                      <CursorTooltip />
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
                                patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
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
                      {/* WI-030 Phase 1 — slide preset picker. Add menu →
                          "슬라이드 시작점…" opens this Dialog. Picking a
                          preset dispatches a single `weave.preset.insertSlide`
                          which stages the slide + child Items as one history
                          entry; Cmd+Z reverts the whole subtree. */}
                      <SlidePresetPicker
                        open={slidePickerOpen}
                        onOpenChange={setSlidePickerOpen}
                        onPick={(presetId) => {
                          const result = editor.exec<unknown, string>("weave.preset.insertSlide", {
                            presetId,
                            containerId: String(docInAgocraft.root.id),
                          });
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
                      <MultiSelectionOverlay selectedIds={selectedIds} />
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
                            ...(Object.keys(attrsOverride).length > 0
                              ? { attrsOverride }
                              : {}),
                          });
                        }}
                      />
                    </div>
                  </EditorProvider>
                </ModeAwareAITooltipProvider>
              </CommandHostProvider>
            </InteractionModeProvider>
          </SelectionProvider>
        </SelectionChromeProvider>
      </RouterProvider>
    </EditorVMProvider>
  );
}

interface MultiSelectionOverlayProps {
  readonly selectedIds: ReadonlySet<string>;
}

/** WI-036 follow-up v2 — multi-selection bounding box overlay.
 *  When 2+ frames are selected, paints a dashed marquee enclosing
 *  every selected frame's viewport bounds plus 4 corner handles
 *  (visual placeholders; multi-frame resize is v1.x backlog). Each
 *  individual frame still mounts its own per-frame handle set
 *  (FrameStage.SelectionLayer), so the overlay is purely additive. */
function MultiSelectionOverlay({ selectedIds }: MultiSelectionOverlayProps): React.ReactElement | null {
  const isMulti = selectedIds.size > 1;
  const [box, setBox] = useState<
    { left: number; top: number; width: number; height: number } | null
  >(null);
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
          prev !== null
          && Math.abs(prev.left - next.left) < 0.5
          && Math.abs(prev.top - next.top) < 0.5
          && Math.abs(prev.width - next.width) < 0.5
          && Math.abs(prev.height - next.height) < 0.5
        ) return prev;
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
        border: "1px dashed var(--accent)",
        boxSizing: "border-box",
      }}
      data-testid="multi-selection-overlay"
    >
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        // WI-036 follow-up — square handle (matches SelectionHandle's
        // kind="corner" 10×10 px). The offset is -16 px so the handle
        // sits clearly OUTSIDE the bounding-box corner and never
        // overlaps the underlying frame's own single-frame corner
        // handle (which is at offset -5 px). Visible range: outer.NW
        // -16 to outer.NW -6 (no overlap with inner.NW -5 to +5).
        <div
          key={corner}
          data-multi-corner={corner}
          className="absolute bg-[color:var(--surface-0)] border border-[color:var(--accent)]"
          style={{
            width: 10,
            height: 10,
            ...(corner.includes("n") ? { top: -16 } : { bottom: -16 }),
            ...(corner.includes("w") ? { left: -16 } : { right: -16 }),
          }}
        />
      ))}
    </div>
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

function QuickActionBarAnchored({ selectedFrameId, selectedIds, onInsertInFrame }: QuickActionBarAnchoredProps): React.ReactElement | null {
  const isMulti = selectedIds.size > 1;
  const [anchor, setAnchor] = useState<
    { top: number; left: number; frameId: string } | null
  >(null);
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
          prev !== null
          && prev.frameId === tagId
          && Math.abs(prev.top - nextTop) < 0.5
          && Math.abs(prev.left - nextLeft) < 0.5
        ) return prev;
        return { top: nextTop, left: nextLeft, frameId: tagId };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedFrameId, isMulti, selectedIds, multiKey]);

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
        renderItem={(id) => {
          // WI-036 follow-up — the `+` button doubles as a hover-
          // open submenu listing every add option (frame / text /
          // 9 shape variants). Single-click dispatches the default
          // (a child frame, matching the original `frame.addChild`);
          // hover opens the submenu so the user can pick any kind
          // without learning a separate path.
          if (id === "frame.addChild") {
            return (
              <FrameAddSubmenu
                frameId={anchor.frameId}
                onInsert={onInsertInFrame}
              />
            );
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

interface FrameAddSubmenuProps {
  readonly frameId: string;
  readonly onInsert: (
    containerId: string,
    kind: DomainKind,
    shapeSubKind?: ShapeSubKind,
  ) => void;
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
        <DropdownMenuItem onSelect={insertHandler("shape", "rectangle")} data-testid="frame-add-shape-rectangle">
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

