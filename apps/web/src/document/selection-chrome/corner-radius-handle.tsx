// WI-109 — Figma-style on-canvas corner-radius handle.
//
// Counterpart to chart-element-view-model: registers per kind (frame / image /
// video / shape) and MERGES with the kind's default resize/rotate chrome. While
// an item is selected it shows a radius grip INSET from the corner along the
// inward diagonal:
//   • uniform mode → ONE grip at the top-right; dragging rounds all four corners.
//   • double-click the grip → SPLIT: four grips, one per corner, dragged
//     independently.
//   • double-click any of the four → MERGE: every corner is set to THAT corner's
//     value and only the top-right grip returns (mode back to uniform).
//
// The grips are portaled to document.body (position: fixed) and tracked every
// animation frame (the canvas pans via CSS transform — no scroll/resize event).
// Screen geometry is derived straight from the item's DOM box: `offsetWidth/
// Height` are the UNSCALED design-px size, `getBoundingClientRect()` is the
// post-transform AABB — together they yield the zoom and the (rotation-aware)
// corner positions without threading the camera through.
//
// Per-kind storage differences live behind `cornerRadiusAdapter` (Rule 6); this
// file owns only geometry + interaction.

import type { Editor, ItemSelectionViewModel, SelectionBounds } from "@agocraft/editor";
import { SelectionChromeZ } from "@weave/design-system";
import { type JSX, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { type CornerKey, type CornerRadii, isUniformRadii } from "../corner-radius.js";
import { cornerRadiusAdapter } from "../corner-radius-adapters.js";
import { cornerRadiusModeStore } from "../corner-radius-mode.js";
import {
  type PlaneProjection,
  planeProjection,
  type SceneItemGeom,
  sceneGeomFor,
} from "./chrome-geom.js";
import { startHandleGesture, toHandlePointer } from "./handle-gesture-runner.js";

interface Pt {
  readonly x: number;
  readonly y: number;
}

/** This item's screen geometry: each corner's client position, the design→screen
 *  zoom, and half the short side in screen px (the radius clamp). */
interface BoxGeom {
  readonly corners: Readonly<Record<CornerKey, Pt>>;
  readonly center: Pt;
  readonly zoom: number;
  readonly halfShortScreen: number;
}

const CORNER_SIGN: Readonly<Record<CornerKey, { sx: number; sy: number }>> = {
  tl: { sx: -1, sy: -1 },
  tr: { sx: 1, sy: -1 },
  br: { sx: 1, sy: 1 },
  bl: { sx: -1, sy: 1 },
};

const GRIP_PX = 12;
const MIN_INSET = 16; // keep a 0-radius grip grabbable (inset from the corner)

/** Derive the rotation-aware screen corners + zoom from the item's DOM box.
 *  `Wd/Hd` (offsetWidth/Height) are design-px; the AABB from
 *  getBoundingClientRect plus the rotation solves the zoom for any angle. */
function readBoxGeom(el: HTMLElement, rotationRad: number): BoxGeom | null {
  const rect = el.getBoundingClientRect();
  const Wd = Math.max(1, el.offsetWidth);
  const Hd = Math.max(1, el.offsetHeight);
  if (rect.width <= 0 || rect.height <= 0) return null;
  const cos = Math.abs(Math.cos(rotationRad));
  const sin = Math.abs(Math.sin(rotationRad));
  // AABB_w = zoom·(Wd·cos + Hd·sin); AABB_h = zoom·(Wd·sin + Hd·cos). Average
  // the two solves for a stable zoom at every angle (identical when axis-aligned).
  const denomW = Wd * cos + Hd * sin;
  const denomH = Wd * sin + Hd * cos;
  const zoom = (rect.width / denomW + rect.height / denomH) / 2;
  if (!(zoom > 0)) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hw = (Wd * zoom) / 2;
  const hh = (Hd * zoom) / 2;
  const cosT = Math.cos(rotationRad);
  const sinT = Math.sin(rotationRad);
  const at = (sx: number, sy: number): Pt => {
    const lx = sx * hw;
    const ly = sy * hh;
    return { x: cx + lx * cosT - ly * sinT, y: cy + lx * sinT + ly * cosT };
  };
  const corners = {
    tl: at(CORNER_SIGN.tl.sx, CORNER_SIGN.tl.sy),
    tr: at(CORNER_SIGN.tr.sx, CORNER_SIGN.tr.sy),
    br: at(CORNER_SIGN.br.sx, CORNER_SIGN.br.sy),
    bl: at(CORNER_SIGN.bl.sx, CORNER_SIGN.bl.sy),
  } as const;
  return { corners, center: { x: cx, y: cy }, zoom, halfShortScreen: Math.min(hw, hh) };
}

/** S3 / DR-138 — the rotation-aware screen corners + zoom straight from the
 *  engine scene geometry (design px) + the live design-plane projection. No
 *  element read; the geometry is the same the renderer used for the box. */
function boxGeomFromScene(g: SceneItemGeom, proj: PlaneProjection): BoxGeom {
  const zoom = proj.scale;
  const cx = proj.left + g.cx * zoom;
  const cy = proj.top + g.cy * zoom;
  const hw = (g.w * zoom) / 2;
  const hh = (g.h * zoom) / 2;
  const cosT = Math.cos(g.rotation);
  const sinT = Math.sin(g.rotation);
  const at = (sx: number, sy: number): Pt => {
    const lx = sx * hw;
    const ly = sy * hh;
    return { x: cx + lx * cosT - ly * sinT, y: cy + lx * sinT + ly * cosT };
  };
  return {
    corners: {
      tl: at(CORNER_SIGN.tl.sx, CORNER_SIGN.tl.sy),
      tr: at(CORNER_SIGN.tr.sx, CORNER_SIGN.tr.sy),
      br: at(CORNER_SIGN.br.sx, CORNER_SIGN.br.sy),
      bl: at(CORNER_SIGN.bl.sx, CORNER_SIGN.bl.sy),
    },
    center: { x: cx, y: cy },
    zoom,
    halfShortScreen: Math.min(hw, hh),
  };
}

/** Unit vector from a corner toward the box center (the inward diagonal). */
function inwardUnit(corner: Pt, center: Pt): Pt {
  const dx = center.x - corner.x;
  const dy = center.y - corner.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

interface Live {
  readonly geom: BoxGeom;
  readonly radii: CornerRadii;
}

/** Track the item's box + current radii every animation frame, re-rendering only
 *  when something the grips depend on actually moved. */
function useLive(
  itemId: string,
  getItem: (id: string) => { attrs: Record<string, unknown> } | null,
  kind: string,
): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    const adapter = cornerRadiusAdapter(kind);
    if (adapter === null) return;
    let raf = 0;
    let prevKey = "";
    const tick = (): void => {
      const item = getItem(itemId);
      // Scene path (S3 / DR-138): geometry from the published scene + the live
      // design-plane projection. Fallback: read the rendered element's box.
      const g = sceneGeomFor(itemId);
      const proj = planeProjection();
      const el =
        g !== undefined && proj !== undefined
          ? null
          : document.querySelector(`[data-frame-id="${CSS.escape(itemId)}"]`);
      const haveGeomSource = (g !== undefined && proj !== undefined) || el instanceof HTMLElement;
      if (!haveGeomSource || item === null) {
        if (prevKey !== "") {
          prevKey = "";
          setLive(null);
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const rotation = (item.attrs.frame as { rotation?: number } | undefined)?.rotation ?? 0;
      const geom =
        g !== undefined && proj !== undefined
          ? boxGeomFromScene(g, proj)
          : el instanceof HTMLElement
            ? readBoxGeom(el, rotation)
            : null;
      const radii = adapter.read(item.attrs);
      if (geom === null) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const key = `${geom.corners.tr.x.toFixed(1)},${geom.corners.tr.y.toFixed(1)},${geom.zoom.toFixed(3)}#${radii.tl},${radii.tr},${radii.br},${radii.bl}`;
      if (key !== prevKey) {
        prevKey = key;
        setLive({ geom, radii });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [itemId, getItem, kind]);
  return live;
}

function useMode(itemId: string): "uniform" | "split" | undefined {
  return useSyncExternalStore(
    cornerRadiusModeStore.subscribe,
    () => cornerRadiusModeStore.peek(itemId),
    () => undefined,
  );
}

interface GripProps {
  readonly corner: CornerKey;
  readonly itemId: string;
  readonly kind: string;
  readonly editor: Editor;
  readonly geom: BoxGeom;
  readonly radii: CornerRadii;
  readonly split: boolean;
}

function Grip({ corner, itemId, kind, editor, geom, radii, split }: GripProps): JSX.Element {
  const adapter = cornerRadiusAdapter(kind);
  const c = geom.corners[corner];
  const dir = inwardUnit(c, geom.center);
  const radiusScreen = Math.min(radii[corner] * geom.zoom, geom.halfShortScreen);
  const inset = Math.max(radiusScreen, MIN_INSET);
  const pos: Pt = { x: c.x + dir.x * inset, y: c.y + dir.y * inset };

  const radiusFromPointer = (clientX: number, clientY: number): number => {
    const proj = (clientX - c.x) * dir.x + (clientY - c.y) * dir.y;
    const screen = Math.max(0, Math.min(proj, geom.halfShortScreen));
    return screen / geom.zoom;
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    if (e.button !== 0 || adapter === null) return;
    const startRadius = radii[corner];
    let last = startRadius;
    const write = (clientX: number, clientY: number): void => {
      const r = radiusFromPointer(clientX, clientY);
      if (Math.abs(r - last) < 0.5) return; // dedup — a click (no move) writes nothing
      last = r;
      if (split) adapter.writeCorner(editor, itemId, corner, r);
      else adapter.writeUniform(editor, itemId, r);
    };
    startHandleGesture({
      kind: "corner-radius-drag",
      handleId: `corner-radius.${corner}`,
      itemId,
      origin: toHandlePointer(e),
      sink: {
        update: (p) => write(p.clientX, p.clientY),
        commit: (p) => write(p.clientX, p.clientY),
      },
    });
  };

  const onDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    if (adapter === null) return;
    if (split) {
      // Merge: all corners adopt THIS corner's value; only the top-right grip returns.
      adapter.writeUniform(editor, itemId, radii[corner]);
      cornerRadiusModeStore.set(itemId, "uniform");
    } else {
      // Split: seed the four-tuple from the current uniform value, show four grips.
      adapter.enterSplit(editor, itemId);
      cornerRadiusModeStore.set(itemId, "split");
    }
  };

  return createPortal(
    <button
      type="button"
      aria-label={split ? `모서리 곡률 (${corner})` : "모서리 곡률 (더블클릭: 모서리별 조절)"}
      title={
        split
          ? "드래그: 이 모서리 곡률 · 더블클릭: 모두 동일하게"
          : "드래그: 곡률 · 더블클릭: 모서리별 조절"
      }
      data-handle-kind="custom"
      data-handle-id={`corner-radius.${corner}`}
      data-corner-radius-handle={itemId}
      data-corner-radius-corner={corner}
      data-testid={`corner-radius-handle-${corner}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: GRIP_PX,
        height: GRIP_PX,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        // DR-design-033 — OPAQUE white fill (parity with the square resize
        // handles' `#ffffff` + the gap-grip diamonds), not the translucent
        // `--surface-1` glass: a see-through grip let the frame edge / radius
        // arc cross visibly through it and read as hollow.
        background: "#ffffff",
        border: "2px solid var(--accent, #4f46e5)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        cursor: "pointer",
        padding: 0,
        touchAction: "none",
        // POINT handle (draggable dot) — same top tier as the resize/rotate +
        // gap grips, above the layout-edit line handles that were occluding it.
        // Single source: the SelectionChromeZ contract (DR-design-033).
        zIndex: SelectionChromeZ.pointHandle,
      }}
    />,
    document.body,
  );
}

function CornerRadiusHandles({
  itemId,
  kind,
  editor,
  getItem,
}: {
  readonly itemId: string;
  readonly kind: string;
  readonly editor: Editor;
  readonly getItem: (id: string) => { attrs: Record<string, unknown> } | null;
}): JSX.Element | null {
  const live = useLive(itemId, getItem, kind);
  const explicitMode = useMode(itemId);
  if (live === null) return null;
  const { geom, radii } = live;
  const split = (explicitMode ?? (isUniformRadii(radii) ? "uniform" : "split")) === "split";
  const corners: ReadonlyArray<CornerKey> = split ? ["tl", "tr", "br", "bl"] : ["tr"];
  return (
    <>
      {corners.map((corner) => (
        <Grip
          key={corner}
          corner={corner}
          itemId={itemId}
          kind={kind}
          editor={editor}
          geom={geom}
          radii={radii}
          split={split}
        />
      ))}
    </>
  );
}

export interface CornerRadiusViewModelDeps {
  readonly itemKind: string;
  readonly editor: Editor;
  /** Live-item getter (reads the orchestrator's docRef). */
  readonly getItem: (id: string) => { attrs: Record<string, unknown> } | null;
}

/** Register one per corner-radius-bearing kind (frame / image / video / shape).
 *  Merges ABOVE the default resize chrome so the inset grips win the pointer. */
export function createCornerRadiusViewModel(
  deps: CornerRadiusViewModelDeps,
): ItemSelectionViewModel {
  return {
    itemKind: deps.itemKind,
    priority: 20,
    handles(info) {
      return [
        {
          id: "corner-radius",
          order: 240,
          // Self-positioning portaled grips — park the spec wrapper offscreen so an
          // inactive (null-render) handle never intercepts a click.
          anchor: {
            type: "freeform" as const,
            layout: (_bounds: SelectionBounds) => ({ x: -99999, y: -99999 }),
          },
          render: () => (
            <CornerRadiusHandles
              itemId={info.itemId}
              kind={deps.itemKind}
              editor={deps.editor}
              getItem={deps.getItem}
            />
          ),
        },
      ];
    },
  };
}
