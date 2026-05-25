import { EditorProvider, useEditorVM } from "@agocraft/editor/react";
import { defaultShapeSubAttrs, type ShapeSubKind } from "@agocraft/core";
import {
  AITooltip,
  AITooltipProvider,
  type AITooltipHotkeyTable,
  Button,
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
  ThemeSwitcher,
} from "@weave/design-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type DocFlavor,
  type DomainKind,
  InteractionModeProvider,
  type ItemFrame,
  SelectionProvider,
  useDesign,
  useInteractionMode,
  useSelection,
  useTooltipsAllowed,
} from "../document";
import { CursorTooltip } from "../document/tooltip/CursorTooltip.js";
import { useEditorHotkeys } from "../document/tooltip/editor-hotkeys.js";
import { useWeaveEditor } from "../document/use-weave-editor.js";
import {
  PeekOverlay,
  PointStackInspector,
  usePeekMode,
} from "../document/peek-mode/index.js";
import { registerZOrderAdapters } from "../document/zorder/register.js";
import { ContextualToolbar } from "../document/toolbar/ContextualToolbar.js";
import { MediaSrcDialog } from "../document/toolbar/MediaSrcDialog.js";
import { RouterProvider } from "../document/interactions/router-context.js";
import { EditorVMProvider } from "../document/interactions/editor-vm-context.js";
import { SelectionChromeProvider } from "../document/interactions/selection-chrome-context.js";
import { createSlideBulletHandleViewModel } from "../document/selection-chrome/slide-bullet-handle.js";
import type { ReactNode as ReactNodeAlias } from "react";
import { FrameStage } from "./FrameStage.js";
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
    <AITooltipProvider
      scan="dataset"
      hotkeyTable={hotkeyTable}
      disabled={!tooltipsAllowed}
    >
      {children}
    </AITooltipProvider>
  );
}

/** Per-frame context menu — wires the Radix open/close into the editor's
 *  interaction mode so other sources (rubber-band, tooltips, frame-click
 *  selection) stand down while the menu is on screen. Lives in this file
 *  because the menu's actions close over DesignPage's editor handles. */
function FrameContextMenu({
  itemId,
  onEnter,
  onDelete,
  children,
}: {
  readonly itemId: string;
  readonly onEnter: () => void;
  readonly onDelete: () => void;
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
          onSelect={onEnter}
          shortcut="⏎"
          data-testid="ctx-enter-frame"
        >
          화면에 맞춤
        </ContextMenuItem>
        <ContextMenuSeparator />
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
    updateShape: rawUpdateShape,
    removeShape: rawRemoveShape,
    reset: rawReset,
    applyChange,
    setPresentationOrder,
    reorderRootChildren,
    setDesignBackground,
    persistNow,
  } = useDesign(designId);
  const { editor, vm, router, selectionChrome } = useWeaveEditor({
    docInAgocraft,
    commandTargets: {
      addItem: rawAddItem,
      removeItem: rawRemoveItem,
      updateItem: rawUpdateItem,
      updateBehavior: rawUpdateBehavior,
      updateShape: rawUpdateShape,
      removeShape: rawRemoveShape,
      reset: rawReset,
    },
    applyChange,
    persist: persistNow,
  });
  const editorHotkeyTable = useEditorHotkeys(editor);

  // DR-018 PoC — register slide-only "add bullet" handle. Demonstrates
  // the extension story: a domain view-model contributes a kind-
  // specific handle (only fires when a slide is selected). The default
  // resize / rotate set continues to render alongside; registry merges.
  useEffect(() => {
    return selectionChrome.registerItemViewModel(
      createSlideBulletHandleViewModel({ editor }),
    );
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
    onReorderRoot: reorderRootChildren,
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
        const item = id
          ? docInAgocraft.root.children.find((c) => String(c.id) === id)
          : undefined;
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
      const frame = (item.attrs as { frame?: { x: number; y: number; width: number; height: number } })
        .frame;
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
      const title = (it.attrs as { title?: string; caption?: string; heading?: string; summary?: string })
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
        x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0,
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
      const result = editor.exec<unknown, string>("weave.item.add", {
        kind,
        containerId: String(docInAgocraft.root.id),
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
  }

  const container = docInAgocraft.root;
  const containerId = String(container.id);
  const rootFlavor =
    ((docInAgocraft.root.attrs.flavor as DocFlavor | undefined) ?? "mixed") as DocFlavor;
  const currentFlavor: DocFlavor = rootFlavor;
  // Mixed flavor activates the Figma-style infinite-canvas surface (pan +
  // user zoom). Stacked flavors keep the legacy fit-to-viewport layout.
  const infiniteCanvas = currentFlavor === "mixed";

  const removeItem = (itemId: string) =>
    editor.exec("weave.item.remove", { itemId, containerId });
  const updateItem: typeof rawUpdateItem = (itemId, patch) =>
    void editor.exec("weave.item.update", { itemId, patch });
  const updateShape: typeof rawUpdateShape = (itemId, shapeId, patch) =>
    void editor.exec("weave.shape.update", { itemId, shapeId, patch });
  const removeShape: typeof rawRemoveShape = (itemId, shapeId) =>
    void editor.exec("weave.shape.remove", { itemId, shapeId });

  // DR-017 — view-state via vm (single source). Previously 5 useState
  // (selection, enteredFrameId, handMode, historyTick) + SelectionContext.
  // The compatibility shim `useSelection` now reads/writes vm.itemSelection
  // and vm.subSelection; downstream call sites are unchanged.
  //
  // We're called from DesignPageBody's function body, which is *outside*
  // the SelectionProvider that the same body's JSX defines. The Provider
  // can't supply us with a vm here, so we pass the vm explicitly. Child
  // components rendered below pick up the same vm via context.
  const {
    selection,
    selectedIds,
    selectFrame,
    selectFrames,
    addFrames,
    toggleFrames,
  } = useSelection(vm);
  const selectedFrameId =
    selection?.kind === "frame" ? selection.id : undefined;
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

  // enteredFrameId — last entry on vm's drill-in trail (single React
  // subscription via signal-aware adapter).
  const enteredFrameStack = useEditorVM(vm, (v) => v.enteredFrameStack.get());
  const enteredFrameId: string | undefined =
    enteredFrameStack.length > 0
      ? enteredFrameStack[enteredFrameStack.length - 1]
      : undefined;
  const setEnteredFrameId = useCallback(
    (id: string | undefined) => {
      if (id === undefined) {
        vm.enteredFrameStack.set([]);
      } else {
        // ItemId is branded `string & { …}`; weave's frame ids round-
        // trip from `String(item.id)` so the cast is structurally safe.
        vm.enteredFrameStack.set([id as never]);
      }
    },
    [vm],
  );

  // V / H tool toggle (Figma parity). Stored on vm.handTool so the
  // FrameStage pan binding consults a single flag.
  const handMode = useEditorVM(vm, (v) => v.handTool.get());
  const setHandMode = useCallback(
    (next: boolean) => {
      vm.handTool.set(next);
    },
    [vm],
  );

  // Esc exits the entered frame (zoom out) when one is active.
  useEffect(() => {
    if (enteredFrameId === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tgt = e.target;
      if (tgt instanceof HTMLElement) {
        if (tgt.matches('input, textarea, [contenteditable="true"]')) return;
      }
      setEnteredFrameId(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enteredFrameId, setEnteredFrameId]);

  // V / H hotkeys for select / hand modes (Figma parity).
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        t.matches('input, textarea, [contenteditable="true"]')
      ) {
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
                <nav
                  className="flex items-center gap-1 text-[12px] text-[color:var(--text-muted)] min-w-0"
                  aria-label="Breadcrumb"
                >
                  {enteredFrameId === undefined ? (
                    <span className="text-[color:var(--text-strong)] truncate max-w-[280px]">
                      {design.title}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="hover:text-[color:var(--text-strong)] truncate max-w-[160px] bg-transparent border-0 p-0 cursor-pointer"
                        onClick={() => setEnteredFrameId(undefined)}
                        data-testid="breadcrumb-exit-entered"
                      >
                        {design.title}
                      </button>
                      <span aria-hidden className="text-[color:var(--text-muted)]">/</span>
                      <span
                        className="text-[color:var(--text-strong)] truncate max-w-[200px]"
                        data-testid="breadcrumb-entered-title"
                      >
                        {(() => {
                          const found = docInAgocraft.root.children.find(
                            (c) => String(c.id) === enteredFrameId,
                          );
                          return (
                            (found?.attrs as { title?: string } | undefined)?.title ?? "Frame"
                          );
                        })()}
                      </span>
                    </>
                  )}
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
                    <AITooltip
                      context="선택"
                      actions={[{ action: "V" }]}
                    >
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
                    <AITooltip
                      context="이동"
                      actions={[{ action: "H / Space" }]}
                    >
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
                    >
                      T&nbsp;&nbsp;텍스트
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>도형</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => addNewItem("shape", "rectangle")}
                      data-testid="add-shape-rectangle"
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
                <AITooltip
                  context="되돌리기"
                  actions={[{ action: "단축키", hotkeyId: "undo" }]}
                >
                  <IconButton
                    aria-label="Undo"
                    size="sm"
                    disabled={!canUndo}
                    onClick={() => {
                      editor.history.undo();
                      bumpHistoryTick();
                    }}
                    data-testid="toolbar-undo"
                  >
                    <IconUndo />
                  </IconButton>
                </AITooltip>
                <AITooltip
                  context="다시 실행"
                  actions={[{ action: "단축키", hotkeyId: "redo" }]}
                >
                  <IconButton
                    aria-label="Redo"
                    size="sm"
                    disabled={!canRedo}
                    onClick={() => {
                      editor.history.redo();
                      bumpHistoryTick();
                    }}
                    data-testid="toolbar-redo"
                  >
                    <IconRedo />
                  </IconButton>
                </AITooltip>
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
                selectedId={selectedFrameId ?? undefined}
                selectedIds={selectedIds}
                onSelect={setSelectedFrameId}
                onToggleSelect={(id) => toggleFrames([id])}
                onMarqueeSelect={onMarqueeSelect}
                enteredId={enteredFrameId ?? undefined}
                onEnter={setEnteredFrameId}
                onFitAll={() => setEnteredFrameId(undefined)}
                onUpdateItem={(itemId, patcher) =>
                  updateItem(itemId, (prev) => ({
                    ...prev,
                    attrs: patcher(prev.attrs as unknown as Record<string, unknown>) as never,
                  }))
                }
                onUpdateShape={(itemId, shapeId, patch) => updateShape(itemId, shapeId, patch)}
                onRemoveShape={(itemId, shapeId) => removeShape(itemId, shapeId)}
                onCommitFrame={(itemId, nextFrame: ItemFrame) =>
                  updateItem(itemId, (prev) => ({
                    ...prev,
                    attrs: { ...prev.attrs, frame: nextFrame } as typeof prev.attrs,
                  }))
                }
                renderFrameMenu={(itemId, children) => (
                  <FrameContextMenu
                    itemId={itemId}
                    onEnter={() => {
                      setEnteredFrameId(itemId);
                      bumpHistoryTick();
                    }}
                    onDelete={() => {
                      removeItem(itemId);
                      bumpHistoryTick();
                    }}
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
                    const el = canvasHostRef.current?.querySelector(`[data-frame-id="${id}"]`);
                    if (el instanceof HTMLElement) el.setAttribute("data-peek-dragging", "");
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
                      if (el instanceof HTMLElement) el.removeAttribute("data-peek-dragging");
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
                      if (el instanceof HTMLElement) el.removeAttribute("data-peek-dragging");
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
                    onChangeDesignBackground={setDesignBackground}
                  />
                </div>
              ) : null}
            </main>

            <ThumbnailPanel
              design={design}
              setPresentationOrder={setPresentationOrder}
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
                  return ((it.attrs as { src?: string }).src) ?? "";
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
                    patch: (prev: { attrs: Readonly<Record<string, unknown>> }) =>
                      ({
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
          </div>
        </EditorProvider>
    </ModeAwareAITooltipProvider>
    </InteractionModeProvider>
    </SelectionProvider>
    </SelectionChromeProvider>
    </RouterProvider>
    </EditorVMProvider>
  );
}
