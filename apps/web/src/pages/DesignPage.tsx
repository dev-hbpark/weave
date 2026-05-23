import type { Item as AgocraftItem } from "@agocraft/core";
import { EditorProvider } from "@agocraft/editor/react";
import {
  AITooltip,
  AITooltipProvider,
  AuroraBg,
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
  DropdownMenuTrigger,
  IconButton,
  Reveal,
  ThemeSwitcher,
  Toolbar,
  ToolbarDivider,
} from "@weave/design-system";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { findItemDeep, getBehaviors, isDomainItem } from "../document/agocraft-mirror.js";
import {
  BehaviorEditor,
  DOMAIN_REGISTRY,
  FULL_FRAME,
  type AgoItem,
  type DocFlavor,
  type DomainKind,
  type ItemFrame,
  useDesign,
} from "../document";
import { DOMAIN_RENDERERS } from "../document/domains";
import { FLAVOR_REGISTRY } from "../document/types.js";
import { useEditorHotkeys } from "../document/tooltip/editor-hotkeys.js";
import { TooltipDescribeContextProvider } from "../document/tooltip/KindTooltip.js";
import { useWeaveEditor } from "../document/use-weave-editor.js";
import { FrameStage } from "./FrameStage.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { ThumbnailPanel } from "./ThumbnailPanel.js";

const KIND_ICONS: Readonly<Record<DomainKind, ReactNode>> = {
  slide: "▭",
  "canvas-design": "◇",
  "block-doc": "≡",
  media: "▤",
};

function BehaviorChips({ item }: { item: AgoItem }) {
  const behaviors = getBehaviors(item);
  if (behaviors.length === 0) return null;
  const camera = behaviors.find((b) => b.kind === "camera-target");
  const hotspots = behaviors.filter((b) => b.kind === "hotspot");
  const reveals = behaviors.filter((b) => b.kind === "reveal-on-step");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em]">
      {camera && camera.kind === "camera-target" ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[color:var(--text-soft)]">
          📷 camera {camera.order + 1}
        </span>
      ) : null}
      {hotspots.length > 0 ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[color:var(--accent-soft)] border border-[color:var(--accent)]/30 text-[color:var(--accent-strong)]">
          ✦ {hotspots.length} hotspot{hotspots.length > 1 ? "s" : ""}
        </span>
      ) : null}
      {reveals.length > 0 ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--accent)]/20 text-[color:var(--text-soft)]">
          ⏵ reveal step{" "}
          {(reveals as { kind: "reveal-on-step"; step: number }[])
            .map((r) => r.step + 1)
            .join(", ")}
        </span>
      ) : null}
    </div>
  );
}

export function DesignPage() {
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
    addBehavior,
  } = useDesign(designId);
  const editor = useWeaveEditor({
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
  });
  const editorHotkeyTable = useEditorHotkeys(editor);

  if (typeof window !== "undefined") {
    (window as unknown as { __weaveEditor?: typeof editor }).__weaveEditor = editor;
    (window as unknown as { __weaveDoc?: typeof docInAgocraft }).__weaveDoc = docInAgocraft;
    (window as unknown as { __weaveDesign?: typeof design }).__weaveDesign = design;
  }

  // Phase 11 — drill route + subPath plumbing is gone. The DesignPage always
  // shows the design's root document; every Frame is visible at its place in
  // the canvas. Selection (Phase 11c) decides where new items land.
  const container = docInAgocraft.root;
  const containerId = String(container.id);
  const containerChildren = container.children;
  const containerTitle = design.title;
  const rootFlavor =
    ((docInAgocraft.root.attrs.flavor as DocFlavor | undefined) ?? "mixed") as DocFlavor;
  const currentFlavor: DocFlavor = rootFlavor;
  const flavorMeta = FLAVOR_REGISTRY[currentFlavor];
  const suggestedKinds = flavorMeta.suggestedKinds;

  // Phase 10b-2 / Phase 11 — clicking the Toolbar's "+ Add" button drops the
  // new frame at the container's center for free-form flavors (Figma-style),
  // or FULL_FRAME for stacked flavors.
  const isFreeForm = currentFlavor === "mixed" || currentFlavor === "canvas-board";
  const centerFrame: ItemFrame = { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 };
  const frameForAdd = (_kind: DomainKind): ItemFrame =>
    isFreeForm ? centerFrame : FULL_FRAME;
  // Phase 11c / 12c — Toolbar Add drops the new Frame into:
  //   1. the currently *entered* frame (drill-in target), or
  //   2. the currently selected frame, or
  //   3. the design root.
  const addItem = (kind: DomainKind) => {
    const target = enteredFrameId ?? selectedFrameId ?? containerId;
    editor.exec("weave.item.add", { kind, containerId: target, frame: frameForAdd(kind) });
  };

  // Drag-and-drop add — the same payload (a DomainKind string) ships across
  // the entire add UX. Drop zones decode it and call `weave.item.add` with
  // the container they live in + a frame anchored at the drop point.
  const DRAG_MIME = "application/x-weave-add-kind";
  const handleDropAt = (
    e: React.DragEvent<HTMLElement>,
    targetContainerId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const kind = e.dataTransfer.getData(DRAG_MIME) as DomainKind | "";
    if (kind === "") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const w = 0.2;
    const h = 0.2;
    const frame: ItemFrame = {
      x: Math.max(0, Math.min(1 - w, px - w / 2)),
      y: Math.max(0, Math.min(1 - h, py - h / 2)),
      width: w,
      height: h,
      rotation: 0,
    };
    editor.exec("weave.item.add", { kind, containerId: targetContainerId, frame });
    bumpHistoryTick();
  };
  const allowDrop = (e: React.DragEvent<HTMLElement>) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
    }
  };
  const removeItem = (itemId: string) =>
    editor.exec("weave.item.remove", { itemId, containerId });
  const updateItem: typeof rawUpdateItem = (itemId, patch) =>
    void editor.exec("weave.item.update", { itemId, patch });
  const updateBehavior: typeof rawUpdateBehavior = (itemId, behaviorId, patch) =>
    void editor.exec("weave.behavior.update", { itemId, behaviorId, patch });
  const updateShape: typeof rawUpdateShape = (itemId, shapeId, patch) =>
    void editor.exec("weave.shape.update", { itemId, shapeId, patch });
  const removeShape: typeof rawRemoveShape = (itemId, shapeId) =>
    void editor.exec("weave.shape.remove", { itemId, shapeId });

  const [historyTick, setHistoryTick] = useState(0);
  const [selectedFrameId, setSelectedFrameId] = useState<string | undefined>(undefined);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | undefined>(undefined);
  const [enteredFrameId, setEnteredFrameId] = useState<string | undefined>(undefined);

  // Phase 12c — Esc exits the entered frame (zoom out).
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
  }, [enteredFrameId]);
  const canUndo = editor.history.canUndo();
  const canRedo = editor.history.canRedo();
  void historyTick;
  const bumpHistoryTick = () => setHistoryTick((t) => t + 1);

  const blockCount = containerChildren.filter(isDomainItem).length;
  const sizeLabel = `${design.width}×${design.height} px`;

  return (
    <AITooltipProvider scan="dataset" hotkeyTable={editorHotkeyTable}>
      <TooltipDescribeContextProvider
        canUndo={canUndo}
        canRedo={canRedo}
        hotkeys={editorHotkeyTable}
      >
        <EditorProvider editor={editor}>
          <AuroraBg />

        <header className="px-6 md:px-10 pt-6 md:pt-10 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="flex items-center gap-2.5 no-underline shrink-0">
            <span
              aria-hidden
              className="inline-block w-6 h-6 rounded-[var(--radius-sm)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)]"
            />
            <span className="text-[18px] font-semibold tracking-tight text-[color:var(--text-strong)]">
              weave
            </span>
          </Link>
          {/* Breadcrumb — drill any depth. */}
          <nav className="flex items-center gap-1.5 text-[12px] text-[color:var(--text-muted)] min-w-0">
            <span aria-hidden>/</span>
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
                <span aria-hidden>›</span>
                <span
                  className="text-[color:var(--text-strong)] truncate max-w-[200px]"
                  data-testid="breadcrumb-entered-title"
                >
                  {(() => {
                    const found = docInAgocraft.root.children.find(
                      (c) => String(c.id) === enteredFrameId,
                    ) ??
                      // also walk deeper
                      undefined;
                    return (found?.attrs as { title?: string } | undefined)?.title ?? "Frame";
                  })()}
                </span>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Toolbar aria-label="Design tools">
            <AITooltip
              context="이전 작업으로 되돌리기"
              actions={[{ action: "되돌리기", hotkeyId: "undo" }]}
            >
              <IconButton
                aria-label="Undo"
                disabled={!canUndo}
                onClick={() => {
                  editor.history.undo();
                  bumpHistoryTick();
                }}
                data-testid="toolbar-undo"
              >
                ↶
              </IconButton>
            </AITooltip>
            <AITooltip
              context="되돌린 작업을 다시 실행"
              actions={[{ action: "다시 실행", hotkeyId: "redo" }]}
            >
              <IconButton
                aria-label="Redo"
                disabled={!canRedo}
                onClick={() => {
                  editor.history.redo();
                  bumpHistoryTick();
                }}
                data-testid="toolbar-redo"
              >
                ↷
              </IconButton>
            </AITooltip>
            <ToolbarDivider />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <AITooltip
                  context="새 블록 추가"
                  actions={[{ action: "메뉴 열기" }]}
                >
                  <Button variant="subtle" size="md" data-testid="toolbar-add">
                    + Add
                  </Button>
                </AITooltip>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{flavorMeta.label} blocks</DropdownMenuLabel>
                {suggestedKinds.map((kind: DomainKind) => {
                  const meta = DOMAIN_REGISTRY[kind];
                  return (
                    <DropdownMenuItem
                      key={kind}
                      icon={KIND_ICONS[kind]}
                      tagline={meta.tagline}
                      onSelect={() => {
                        addItem(kind);
                        bumpHistoryTick();
                      }}
                      data-testid={`toolbar-add-${kind}`}
                    >
                      {meta.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </Toolbar>
          {/* Tooltip via dataset (provider scans `[data-ai-tooltip]`) — bypasses
              the Button asChild Slot chain which has a known limitation forwarding
              props through Button's multi-child fragment content. */}
          <Button size="md" trailingIcon={<span aria-hidden>▶</span>} asChild>
            <Link
              to={`/design/${designId}/present`}
              data-testid="toolbar-present"
              data-ai-tooltip="true"
              data-tooltip-context="발표 모드로 전환"
              data-tooltip-actions='[{"action":"현재 디자인을 풀스크린으로 발표"}]'
            >
              Present
            </Link>
          </Button>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Phase 10b-2 — secondary "drag-add" tile row. Each tile is the same
          kind as the Add menu's items, but draggable: pick one up, drop on a
          sub-doc tile (lands inside that sub-doc) or on the main area (lands
          in the current container). The dragged item is positioned at the
          drop point's coordinate. */}
      <div className="px-6 md:px-10 pt-3 flex items-center gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] px-1.5 py-1"
          role="toolbar"
          aria-label="Drag to add"
        >
          <span
            className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)] px-2"
            data-testid="add-target-hint"
          >
            {selectedFrameId ? "Add into selected frame" : "Add to root"}
          </span>
          {suggestedKinds.map((kind: DomainKind) => {
            const meta = DOMAIN_REGISTRY[kind];
            return (
              <button
                key={kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, kind);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => {
                  addItem(kind);
                  bumpHistoryTick();
                }}
                title={`${meta.label} — drag onto a doc, or click to add at center`}
                data-testid={`drag-add-${kind}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] text-[12px] text-[color:var(--text-default)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] cursor-grab active:cursor-grabbing"
              >
                <span aria-hidden>{KIND_ICONS[kind]}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <main
        className="mx-auto max-w-[920px] px-6 md:px-10 pt-10 md:pt-14 pb-32"
        onDragOver={allowDrop}
        onDrop={(e) => handleDropAt(e, containerId)}
      >
        <Reveal mode="entrance" as="section" y={14}>
          <p className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--text-soft)] mb-3">
            {flavorMeta.label} · {sizeLabel}
          </p>
          <h1 className="text-[clamp(32px,4.4vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em] text-[color:var(--text-strong)]">
            {containerTitle}
          </h1>
          <p className="mt-3 text-[14px] text-[color:var(--text-soft)]">
            {blockCount} {blockCount === 1 ? "block" : "blocks"}
            {` · updated ${new Date(design.meta.updatedAt).toLocaleString()}`}
          </p>
        </Reveal>

        <section className="mt-10">
          {/* Phase 11b — Figma-style frame canvas. Every Frame is positioned
              by its 0..1 frame inside the design.width × design.height stage.
              Nested frames recurse — no drill-in. Selection + ContextMenu
              wiring lands in Phase 11c. */}
          <FrameStage
            designWidth={design.width}
            designHeight={design.height}
            root={docInAgocraft.root}
            document={docInAgocraft}
            editor={editor}
            selectedId={selectedFrameId ?? undefined}
            onSelect={setSelectedFrameId}
            enteredId={enteredFrameId ?? undefined}
            onEnter={setEnteredFrameId}
            onUpdateItem={(itemId, patcher) =>
              updateItem(itemId, (prev) => ({
                ...prev,
                attrs: patcher(prev.attrs as unknown as Record<string, unknown>) as never,
              }))
            }
            onUpdateShape={(itemId, shapeId, patch) => updateShape(itemId, shapeId, patch)}
            onRemoveShape={(itemId, shapeId) => removeShape(itemId, shapeId)}
            onDropAdd={handleDropAt}
            onDragOver={allowDrop}
            onCommitFrame={(itemId, nextFrame) =>
              updateItem(itemId, (prev) => ({
                ...prev,
                attrs: { ...prev.attrs, frame: nextFrame } as typeof prev.attrs,
              }))
            }
            selectedHotspotId={selectedHotspotId}
            onSelectHotspot={setSelectedHotspotId}
            onCommitHotspotRegion={(itemId, hotspotId, region) =>
              updateBehavior(itemId, hotspotId, (b) => {
                if (b.kind !== "hotspot") return b;
                return { ...b, region };
              })
            }
            renderFrameMenu={(itemId, children) => (
              <ContextMenu key={itemId}>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() => {
                      setEnteredFrameId(itemId);
                      bumpHistoryTick();
                    }}
                    shortcut="⏎"
                    data-testid={`ctx-enter-frame`}
                  >
                    Enter frame
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      removeItem(itemId);
                      bumpHistoryTick();
                    }}
                    variant="danger"
                    shortcut="⌫"
                    data-testid={`ctx-delete-frame`}
                  >
                    Delete frame
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem disabled>Duplicate (Phase 11c)</ContextMenuItem>
                  <ContextMenuItem disabled>Move up / down (Phase 11c)</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
          />
          {blockCount === 0 ? (
            <div className="mt-6 rounded-[var(--radius-xl)] bg-[color:var(--surface-1)] border border-dashed border-[color:var(--surface-1-border)] p-10 text-center">
              <p className="text-[14px] text-[color:var(--text-soft)]">
                Empty design — use the{" "}
                <strong>+ Add</strong> menu in the toolbar to drop a frame.
              </p>
            </div>
          ) : null}
        </section>
      </main>

      <ThumbnailPanel
        design={design}
        setPresentationOrder={setPresentationOrder}
        selectedId={selectedFrameId}
        onSelect={setSelectedFrameId}
      />

      {/* Phase 13a — Properties panel for the selected frame. Mounts only
          when there is a selection, so the canvas stays uncluttered when
          nothing's selected. */}
      {(() => {
        if (selectedFrameId === undefined) return null;
        const selected = findItemDeep(docInAgocraft, selectedFrameId);
        if (selected === undefined) return null;
        return (
          <PropertiesPanel
            item={selected}
            onCommitFrame={(itemId, nextFrame) =>
              updateItem(itemId, (prev) => ({
                ...prev,
                attrs: { ...prev.attrs, frame: nextFrame } as typeof prev.attrs,
              }))
            }
            onCommitAttrs={(itemId, patch) =>
              updateItem(itemId, (prev) => ({
                ...prev,
                attrs: { ...prev.attrs, ...patch } as typeof prev.attrs,
              }))
            }
            onCommitBehavior={(itemId, behaviorId, patch) =>
              updateBehavior(itemId, behaviorId, patch)
            }
            onAddBehavior={(itemId, behavior) => {
              addBehavior(itemId, behavior);
            }}
            onClose={() => setSelectedFrameId(undefined)}
          />
        );
      })()}
        </EditorProvider>
      </TooltipDescribeContextProvider>
    </AITooltipProvider>
  );
}
