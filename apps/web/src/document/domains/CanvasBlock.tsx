import { useEditorOrNull } from "@agocraft/editor/react";
import { createInputBus } from "@agocraft/input/bus";
import {
  Card,
  CardEyebrow,
  EditableText,
  SelectionLayer,
  type SelectionLayerCapability,
} from "@weave/design-system";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RubberBandLayer } from "../rubber-band/RubberBandLayer.js";
import {
  type CanvasShapeTarget,
  canvasShapeTargetFor,
  createCanvasShapeCapability,
} from "../manipulation/index.js";
import type { HandleDir } from "../manipulation/types.js";
import type { AgoItem, CanvasAttrs, CanvasShape } from "../types.js";

interface CanvasBlockProps {
  readonly item: AgoItem<"canvas-design">;
  readonly onUpdate?: (patch: Partial<CanvasAttrs>) => void;
  readonly onUpdateShape?: (shapeId: string, patch: Partial<CanvasShape>) => void;
  readonly onRemoveShape?: (shapeId: string) => void;
}

type DragMode =
  | { kind: "none" }
  | { kind: "move"; startX: number; startY: number; orig: CanvasShape }
  | { kind: "resize"; dir: HandleDir; startX: number; startY: number; orig: CanvasShape }
  | { kind: "rotate"; startAngle: number; orig: CanvasShape; centerX: number; centerY: number };

export function CanvasBlock({ item, onUpdate, onUpdateShape, onRemoveShape }: CanvasBlockProps) {
  const editable = onUpdate !== undefined;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // WI-017 Phase F-2 — track viewport pixel size for RubberBandLayer's
  // ratio normalization (shapes use 0..1 ratio of the viewport).
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (el === null) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setViewportSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dragRef = useRef<DragMode>({ kind: "none" });
  // WI-013 Phase 3 — when CanvasBlock is rendered inside an `<EditorProvider>`
  // (DemoDocPage path), we look up the agocraft manipulation capabilities and
  // dispatch through them. Outside a provider (e.g., PresentPage read-only
  // render), we keep the weave-local capability directly. Both routes end up
  // calling the same apply functions (the agocraft side delegates via the
  // bridge registered in useWeaveEditor).
  const editor = useEditorOrNull();

  // Build local capability once with stable closures. Adapter does not store the
  // shape — we pass the latest snapshot each time via `canvasShapeTargetFor`.
  const localCapability = useMemo(
    () =>
      createCanvasShapeCapability({
        updateShape: (_itemId, shapeId, patch) => onUpdateShape?.(shapeId, patch),
        removeShape: (_itemId, shapeId) => onRemoveShape?.(shapeId),
      }),
    [onUpdateShape, onRemoveShape],
  );

  // Dispatch helpers — when an editor is present, route through
  // `editor.manipulations.resolve(kind, category).update(...)`. Otherwise fall
  // back to the local capability. Both paths produce the same updateShape /
  // removeShape side-effects.
  const dispatchMove = useCallback(
    (target: CanvasShapeTarget, dx: number, dy: number) => {
      const cap = editor?.manipulations.resolve("canvas-shape", "move");
      if (cap?.update !== undefined) {
        cap.update({ target, dx, dy }, { target: target as never, scratch: {} });
        return;
      }
      localCapability.move?.apply(target, { dx, dy });
    },
    [editor, localCapability],
  );
  const dispatchResize = useCallback(
    (target: CanvasShapeTarget, dw: number, dh: number, dir: HandleDir) => {
      const cap = editor?.manipulations.resolve("canvas-shape", "resize");
      if (cap?.update !== undefined) {
        cap.update({ target, dw, dh, dir }, { target: target as never, scratch: {} });
        return;
      }
      localCapability.resize?.apply(target, { dw, dh, dir });
    },
    [editor, localCapability],
  );
  const dispatchRotate = useCallback(
    (target: CanvasShapeTarget, deltaRadians: number) => {
      const cap = editor?.manipulations.resolve("canvas-shape", "rotate");
      if (cap?.update !== undefined) {
        cap.update(
          { target, deltaRadians },
          { target: target as never, scratch: {} },
        );
        return;
      }
      localCapability.rotate?.apply(target, deltaRadians);
    },
    [editor, localCapability],
  );

  // Public-facing `capability` keeps SelectionLayer's interface unchanged —
  // it only reads metadata flags (moveable / resizable / rotatable / handles).
  const capability = localCapability;

  /** Convert pixel delta to 0..1 ratio delta of the canvas viewport. Phase 10a
   *  moved coords from percent → ratio; this is the conversion at the dispatch
   *  boundary (pointer events still arrive in pixels). */
  const pxToRatio = useCallback((dx: number, dy: number) => {
    const vp = viewportRef.current;
    if (vp === null) return { dxR: 0, dyR: 0 };
    const rect = vp.getBoundingClientRect();
    return { dxR: dx / rect.width, dyR: dy / rect.height };
  }, []);

  // Pointer drag — uses @agocraft/input/bus on window so a drag survives the
  // pointer leaving the shape (you can drag past the canvas edge and still
  // receive move/up). bus dispose runs on unmount, fixing R-18 by default.
  useEffect(() => {
    if (!editable) return undefined;
    if (typeof window === "undefined") return undefined;
    const bus = createInputBus({ target: window, origin: "canvas-block" });

    const off = bus.subscribe((ev) => {
      if (ev.kind !== "pointer") return;
      const drag = dragRef.current;
      if (drag.kind === "none") return;
      if (ev.phase === "move") {
        if (drag.kind === "move") {
          const { dxR, dyR } = pxToRatio(
            ev.position.x - drag.startX,
            ev.position.y - drag.startY,
          );
          const target = canvasShapeTargetFor(item, drag.orig);
          dispatchMove(target, dxR, dyR);
        } else if (drag.kind === "resize") {
          const { dxR, dyR } = pxToRatio(
            ev.position.x - drag.startX,
            ev.position.y - drag.startY,
          );
          // Corner / edge-anchored resize: pass the signed pointer delta through.
          // The capability adapter decides which edges actually move based on
          // `dir` — the opposite edge / corner stays fixed.
          const target = canvasShapeTargetFor(item, drag.orig);
          dispatchResize(target, dxR, dyR, drag.dir);
        } else if (drag.kind === "rotate") {
          const dxFromCenter = ev.position.x - drag.centerX;
          const dyFromCenter = ev.position.y - drag.centerY;
          const angle = Math.atan2(dyFromCenter, dxFromCenter) + Math.PI / 2; // top = 0
          const delta = angle - drag.startAngle;
          const target = canvasShapeTargetFor(item, drag.orig);
          dispatchRotate(target, delta);
          dragRef.current = {
            ...drag,
            startAngle: angle,
            orig: { ...drag.orig, rotation: drag.orig.rotation + delta },
          };
        }
      } else if (ev.phase === "up" || ev.phase === "cancel") {
        dragRef.current = { kind: "none" };
      }
    });

    return () => {
      off();
      bus.dispose();
    };
  }, [editable, item, dispatchMove, dispatchResize, dispatchRotate, pxToRatio]);

  // Esc deselects when the canvas has focus / hover. Kept tiny — the doc-level
  // hotkey registry takes over once we wire scope swapping at WI-009 Phase 3+.
  useEffect(() => {
    if (!editable) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (selectedId === null) return;
      if (e.key === "Escape") setSelectedId(null);
      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        document.activeElement === document.body
      ) {
        e.preventDefault();
        onRemoveShape?.(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, selectedId, onRemoveShape]);

  const selectedShape = useMemo(
    () =>
      selectedId === null ? null : (item.attrs.shapes.find((s) => s.id === selectedId) ?? null),
    [selectedId, item.attrs.shapes],
  );

  const selectedTarget: CanvasShapeTarget | null = useMemo(
    () => (selectedShape === null ? null : canvasShapeTargetFor(item, selectedShape)),
    [item, selectedShape],
  );

  const selectionCapability: SelectionLayerCapability = {
    moveable: capability.move !== undefined,
    resizable: capability.resize !== undefined,
    rotatable: capability.rotate !== undefined,
    resizeHandles: capability.resize?.handles ?? [],
  };

  function handleShapePointerDown(shape: CanvasShape, e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    setSelectedId(shape.id);
  }

  function startMove(e: React.PointerEvent) {
    if (selectedShape === null) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      orig: selectedShape,
    };
  }

  function startResize(dir: HandleDir, e: React.PointerEvent) {
    if (selectedShape === null) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind: "resize",
      dir,
      startX: e.clientX,
      startY: e.clientY,
      orig: selectedShape,
    };
  }

  function startRotate(e: React.PointerEvent) {
    if (selectedShape === null) return;
    const vp = viewportRef.current;
    if (vp === null) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const rect = vp.getBoundingClientRect();
    const centerX = rect.left + ((selectedShape.x + selectedShape.width / 2) / 100) * rect.width;
    const centerY = rect.top + ((selectedShape.y + selectedShape.height / 2) / 100) * rect.height;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) + Math.PI / 2;
    dragRef.current = {
      kind: "rotate",
      startAngle,
      orig: selectedShape,
      centerX,
      centerY,
    };
  }

  return (
    <Card tone="default" className="border-l-4 border-l-[color:var(--domain-canvas-accent)]">
      <CardEyebrow>Canvas · {new Date(item.meta.createdAt).toLocaleTimeString()}</CardEyebrow>
      {editable ? (
        <EditableText
          as="div"
          multiline
          value={item.attrs.summary}
          ariaLabel="Canvas summary"
          placeholder="Canvas summary…"
          className="mt-3 text-[14px] text-[color:var(--text-soft)]"
          onCommit={(next) => onUpdate({ summary: next })}
        />
      ) : (
        <p className="mt-3 text-[14px] text-[color:var(--text-soft)]">{item.attrs.summary}</p>
      )}
      {/* WI-017 Phase F-2 — canvas-design frame interior is a rubber-band
          host. Drag on empty space opens the InsertableCapability popover for
          containerKind="canvas-design" (shape variants per aspect bucket).
          Falls back to a plain div when no editor is in context (e.g.
          PresentPage read-only render). */}
      {editable && editor !== null ? (
        <RubberBandLayer
          ref={viewportRef}
          containerKind="canvas-design"
          containerId={String(item.id)}
          containerSize={viewportSize}
          editor={editor}
          className="mt-4 rounded-[var(--radius-lg)] aspect-[16/10] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] overflow-hidden"
        >
          <CanvasViewportChildren
            item={item}
            editable={editable}
            selectedShape={selectedShape}
            selectedTarget={selectedTarget}
            selectionCapability={selectionCapability}
            handleShapePointerDown={handleShapePointerDown}
            startMove={startMove}
            startResize={startResize}
            startRotate={startRotate}
          />
        </RubberBandLayer>
      ) : (
        <div
          ref={viewportRef}
          className="mt-4 relative rounded-[var(--radius-lg)] aspect-[16/10] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] overflow-hidden"
        >
          <CanvasViewportChildren
            item={item}
            editable={editable}
            selectedShape={selectedShape}
            selectedTarget={selectedTarget}
            selectionCapability={selectionCapability}
            handleShapePointerDown={handleShapePointerDown}
            startMove={startMove}
            startResize={startResize}
            startRotate={startRotate}
          />
        </div>
      )}

      {editable ? (
        <p className="mt-3 text-[11px] text-[color:var(--text-muted)] uppercase tracking-[0.14em]">
          Click a shape to select. Drag to move. Corner / edge handles resize (center-based). Top
          dot rotates. Esc deselects. Delete removes.
        </p>
      ) : null}
    </Card>
  );
}

interface CanvasViewportChildrenProps {
  readonly item: AgoItem<"canvas-design">;
  readonly editable: boolean;
  readonly selectedShape: CanvasShape | null;
  readonly selectedTarget: CanvasShapeTarget | null;
  readonly selectionCapability: SelectionLayerCapability;
  readonly handleShapePointerDown: (
    shape: CanvasShape,
    e: React.PointerEvent,
  ) => void;
  readonly startMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  readonly startResize: (
    dir: HandleDir,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  readonly startRotate: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

/** Extracted viewport body (shapes + SelectionLayer) so the same JSX renders
 *  inside both branches of the host (RubberBandLayer when editable, plain div
 *  in the read-only / no-editor fallback). */
function CanvasViewportChildren({
  item,
  editable,
  selectedShape,
  selectedTarget,
  selectionCapability,
  handleShapePointerDown,
  startMove,
  startResize,
  startRotate,
}: CanvasViewportChildrenProps) {
  return (
    <>
      {item.attrs.shapes.map((shape) => (
        <button
          type="button"
          key={shape.id}
          data-shape-id={shape.id}
          aria-label={`Shape ${shape.id}`}
          onPointerDown={(e) => handleShapePointerDown(shape, e)}
          // Phase 12 — block the bubbling React `click` too so the
          // containing FrameStage doesn't also select the canvas frame
          // when the user picks a shape.
          onClick={(e) => e.stopPropagation()}
          className="absolute rounded-[var(--radius-md)] p-0 m-0 border-0 cursor-pointer"
          style={{
            left: `${shape.x * 100}%`,
            top: `${shape.y * 100}%`,
            width: `${shape.width * 100}%`,
            height: `${shape.height * 100}%`,
            background: shape.hue,
            opacity: 0.78,
            transform: `rotate(${shape.rotation}rad)`,
            transformOrigin: "center center",
            boxShadow: "0 8px 22px -6px rgba(0,0,0,0.4)",
          }}
        />
      ))}
      {editable && selectedShape !== null && selectedTarget !== null ? (
        <SelectionLayer
          box={{
            left: `${selectedShape.x * 100}%`,
            top: `${selectedShape.y * 100}%`,
            width: `${selectedShape.width * 100}%`,
            height: `${selectedShape.height * 100}%`,
            rotation: selectedShape.rotation,
          }}
          capability={selectionCapability}
          onMoveStart={startMove}
          onResizeStart={startResize}
          onRotateStart={startRotate}
        />
      ) : null}
    </>
  );
}
