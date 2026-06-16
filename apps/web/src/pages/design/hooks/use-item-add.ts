import {
  type Document as AgocraftDocument,
  defaultShapeSubAttrs,
  type ShapeSubKind,
} from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useCallback, useEffect, useState } from "react";
import type { DomainKind, ItemFrame } from "../../../document";
import { absoluteFrameBox, findItemDeep } from "../../../document/agocraft-mirror.js";
import { defaultAttrsFor } from "../../../document/domain-kinds.js";
import { layoutChildFromTextAutoResize } from "../../../document/domains/derive-text-auto-resize.js";
import { measureFreeTextHugRatio } from "../../../document/layout/text-measurer.js";
import { type ItemAdderKind, setItemAdder } from "../../../document/tooltip/editor-hotkeys.js";
import { cameraFitBox } from "../../frame-camera-bridge.js";

// DR-027 / WI-071 Phase 2 — extracted from DesignPageBody (WI-020 item-add
// cluster). Behavior-preserving. Owns the "+" add-menu handler (`addNewItem`),
// the tool-hotkey adder (R/T/L/F → setItemAdder), and the slide-preset dialog
// open state. All creation routes through editor.exec("weave.item.add").
//
// Cooperating hook (DR-027 Surface E): the orchestrator owns the shared refs
// this consumes — `addGeometryRef` (geometry needs the shared canvasHostRef /
// screenToDesign projection), `selectedFrameIdRef` (current selection mirror),
// `setSelectedFrameIdRef` (selection setter) — and injects them so this hook is
// called AFTER selection state exists without re-threading those concerns.

const DEFAULT_TEXT_LINE_HEIGHT = 1.4;

/** WI-051 follow-up — content-hug a FREE-placed text's seeded frame (flag-gated).
 *  A manual text add gets `WIDTH_AND_HEIGHT` (auto width+height) but the box is
 *  seeded at a FIXED placement width — the geometry-only engine can't measure text,
 *  so the box never fits the content. When the engine text measurer is enabled AND
 *  the container is FREE (no managing flex/grid layout — a managed text is sized by
 *  the engine instead, not here), measure the default text and fit the box to it,
 *  centered on its placement. Returns the original frame when disabled / no measurer /
 *  managed container / no container px. */
function hugFreeTextFrame(
  doc: Parameters<typeof absoluteFrameBox>[0],
  containerId: string,
  frame: ItemFrame,
  designWidth: number,
  designHeight: number,
  fontSizePx: number,
): ItemFrame {
  const container = findItemDeep(doc, containerId);
  const layout = (container?.attrs as { layout?: { kind?: string } } | undefined)?.layout;
  // Managed (flex/grid) text is sized by the engine (Step 3.5), never host-hugged.
  if (layout !== undefined && layout.kind !== "absolute-constraints") return frame;
  const box = absoluteFrameBox(doc, containerId, designWidth, designHeight);
  if (box === null) return frame;
  const td = defaultAttrsFor("text");
  const hug = measureFreeTextHugRatio(
    {
      text: td.text,
      fontFamily: td.fontFamily,
      fontSizePx,
      lineHeight: td.lineHeight,
      letterSpacing: td.letterSpacing,
    },
    box.w,
    box.h,
  );
  if (hug === undefined) return frame;
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  return {
    ...frame,
    x: cx - hug.wRatio / 2,
    y: cy - hug.hRatio / 2,
    width: hug.wRatio,
    height: hug.hRatio,
  };
}

/** Geometry computer (orchestrator-owned; wraps screenToDesign + computeAddFrame). */
type AddGeometryFn = (
  containerId: string,
  isText: boolean,
) => { frame: ItemFrame; fontSizePx?: number; fontSizeRatio?: number } | null;

export interface UseItemAddParams {
  readonly editor: Editor;
  /** Reactive document (addNewItem reads root id + selected item). */
  readonly document: AgocraftDocument;
  /** Live document mirror for the tool-hotkey adder closure. */
  readonly docRef: React.MutableRefObject<AgocraftDocument>;
  /** Current selected frame id mirror (read at click/hotkey time). */
  readonly selectedFrameIdRef: React.MutableRefObject<string | undefined>;
  /** Selection setter mirror (assigned by the orchestrator). */
  readonly setSelectedFrameIdRef: React.MutableRefObject<((id: string | null) => void) | null>;
  /** Geometry computer mirror (orchestrator-owned). */
  readonly addGeometryRef: React.MutableRefObject<AddGeometryFn>;
  /** WI-153 P3 / WI-180 — selection-aware add-container resolver
   *  (InsertionPolicy.addContainerFor, reading the live selection).
   *  `undefined` = design root. Free placement resolves a selected frame
   *  (add lands inside it); page-bounded formats resolve the ACTIVE PAGE
   *  regardless of selection (sub-page frames are groups). Policy comes
   *  from the editor mode (WI-166) — resolved by the orchestrator, never
   *  by a flavor compare here (Rule 6). */
  readonly resolveAddContainerRef: React.MutableRefObject<() => string | undefined>;
  readonly designWidth: number;
  readonly designHeight: number;
}

export interface UseItemAdd {
  readonly addNewItem: (
    kind: DomainKind,
    shapeSubKind?: ShapeSubKind,
    srcOverride?: string,
    subAttrsOverride?: ReturnType<typeof defaultShapeSubAttrs>,
    lineAttrs?: {
      readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
      readonly smooth?: boolean;
      readonly heads?: { readonly start: string; readonly end: string };
    },
    // WI-076 — caption (image `alt`) for the source-less placeholder. Image only.
    altOverride?: string,
  ) => void;
  readonly slidePickerOpen: boolean;
  readonly setSlidePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useItemAdd({
  editor,
  document,
  docRef,
  selectedFrameIdRef,
  setSelectedFrameIdRef,
  addGeometryRef,
  resolveAddContainerRef,
  designWidth,
  designHeight,
}: UseItemAddParams): UseItemAdd {
  // WI-020 — "+" add menu handler.
  const addNewItem = useCallback(
    (
      kind: DomainKind,
      shapeSubKind?: ShapeSubKind,
      srcOverride?: string,
      // Seed an explicit subAttrs (e.g. an OPEN `poly` for the freeform line)
      // instead of the kind's closed default. Only consulted for shapes.
      subAttrsOverride?: ReturnType<typeof defaultShapeSubAttrs>,
      // Seed `line` kind attrs (points + optional smooth/heads). Only for "line".
      lineAttrs?: {
        readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
        readonly smooth?: boolean;
        readonly heads?: { readonly start: string; readonly end: string };
      },
      // WI-076 — caption (image `alt`) for the source-less placeholder.
      altOverride?: string,
    ) => {
      // Default frame for adds INTO a frame (frame-relative). Root adds override
      // this with the viewport-centred geometry below.
      let frame: ItemFrame = {
        x: 0.3,
        y: 0.3,
        width: 0.4,
        height: 0.4,
        rotation: 0,
      };
      // Compose attrsOverride at creation time (inside weave.item.add) to avoid
      // racing the staging pipeline.
      const attrsOverride: Record<string, unknown> = {};
      if (kind === "shape" && shapeSubKind && shapeSubKind !== "rectangle") {
        attrsOverride.shape = shapeSubKind;
        attrsOverride.subAttrs = subAttrsOverride ?? defaultShapeSubAttrs(shapeSubKind);
      }
      if (kind === "line" && lineAttrs) {
        attrsOverride.points = lineAttrs.points;
        if (lineAttrs.smooth !== undefined) attrsOverride.smooth = lineAttrs.smooth;
        attrsOverride.heads = lineAttrs.heads ?? { start: "none", end: "none" };
      }
      if ((kind === "image" || kind === "video") && srcOverride) {
        attrsOverride.src = srcOverride;
      }
      // WI-076 — seed the caption (alt) so a source-less image renders its
      // placeholder text immediately. Trimmed-empty falls back to the default "".
      if (kind === "image" && altOverride !== undefined && altOverride.trim().length > 0) {
        attrsOverride.alt = altOverride.trim();
      }
      // Container rule (WI-180): the editor mode's InsertionPolicy resolves
      // the container from the live selection — free placement adds INTO a
      // selected frame; page-bounded formats add to the ACTIVE PAGE even
      // with a (group-)frame selected. No flavor compare here (Rule 6).
      const rootId = String(document.root.id);
      const sel = selectedFrameIdRef.current;
      const containerId = resolveAddContainerRef.current() ?? rootId;
      // The policy resolved the SELECTED frame as the container → the add is
      // frame-scoped (frame-centred geometry zoom below).
      const intoSelectedFrame = sel !== undefined && containerId === sel;
      // Geometry: root → viewport-centred; frame → frame-centred.
      const geo = addGeometryRef.current(containerId, kind === "text");
      if (geo !== null) {
        frame = geo.frame;
      }
      if (kind === "text") {
        if (geo?.fontSizePx !== undefined) {
          attrsOverride.fontSize = Math.max(1, Math.round(geo.fontSizePx));
          // WI-fontsize-spec — store the responsive ratio as the canonical
          // agocraft fontSizeSpec; `fontSize` stays as the px mirror.
          if (geo.fontSizeRatio !== undefined) {
            attrsOverride.fontSizeSpec = { kind: "ratio", value: geo.fontSizeRatio };
          }
        }
        // Auto-width per TEXT_ITEM_SPEC §4.6 — width auto-fits the text, height
        // is the manual axis (seeded to one line so the box hugs the text).
        attrsOverride.layoutChild = layoutChildFromTextAutoResize("WIDTH_AND_HEIGHT");
        if (geo?.fontSizeRatio !== undefined) {
          frame = { ...frame, height: geo.fontSizeRatio * DEFAULT_TEXT_LINE_HEIGHT };
        }
        // WI-051 follow-up — fit the box to the measured content (flag-gated).
        const fsHug =
          typeof attrsOverride.fontSize === "number"
            ? attrsOverride.fontSize
            : defaultAttrsFor("text").fontSize;
        frame = hugFreeTextFrame(document, containerId, frame, designWidth, designHeight, fsHug);
      }
      // WI-077 — a chart can't be created bare: it references a dataset. Route
      // to the one-transaction `weave.chart.add` (seeds a sample dataset AND
      // the chart in a single undoable step) instead of `weave.item.add`. The
      // container + frame + camera logic above is reused as-is.
      if (kind === "chart") {
        const chartRes = editor.exec<unknown, string>("weave.chart.add", { containerId, frame });
        if (!chartRes.ok) return;
        setSelectedFrameIdRef.current?.(chartRes.value);
        if (intoSelectedFrame) {
          const box = absoluteFrameBox(document, containerId, designWidth, designHeight);
          if (box !== null) cameraFitBox(box);
        }
        return;
      }
      const result = editor.exec<unknown, string>("weave.item.add", {
        kind,
        containerId,
        frame,
        ...(Object.keys(attrsOverride).length > 0 ? { attrsOverride } : {}),
      });
      if (!result.ok) return;
      setSelectedFrameIdRef.current?.(result.value);
      // Added into a selected frame → bring that frame full-screen.
      if (intoSelectedFrame) {
        const box = absoluteFrameBox(document, containerId, designWidth, designHeight);
        if (box !== null) cameraFitBox(box);
      }
    },
    [
      editor,
      document,
      designWidth,
      designHeight,
      selectedFrameIdRef,
      setSelectedFrameIdRef,
      addGeometryRef,
      resolveAddContainerRef,
    ],
  );

  // WI-035 P1 — tool hotkey (R / T / L / F) handler. Insert a default-sized item
  // of the requested kind into the selected frame (or root). Parent-local ratios
  // are sensible press-and-place starting points; drag-tuning is the user's job.
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
      const doc = docRef.current;
      if (doc === undefined) return;
      const rootId = String(doc.root.id);
      const sel = selectedFrameIdRef.current;
      // WI-153 P3 / WI-180 — same policy-resolved container as addNewItem.
      const containerId = resolveAddContainerRef.current() ?? rootId;
      const intoSelectedFrame = sel !== undefined && containerId === sel;
      let frame = spec.frame;
      const attrsOverride: Record<string, unknown> = {};
      const geo = addGeometryRef.current(containerId, spec.kind === "text");
      if (geo !== null) {
        frame = geo.frame;
      }
      if (spec.kind === "text") {
        if (geo?.fontSizePx !== undefined) {
          attrsOverride.fontSize = Math.max(1, Math.round(geo.fontSizePx));
          if (geo.fontSizeRatio !== undefined) {
            attrsOverride.fontSizeSpec = { kind: "ratio", value: geo.fontSizeRatio };
          }
        }
        attrsOverride.layoutChild = layoutChildFromTextAutoResize("WIDTH_AND_HEIGHT");
        if (geo?.fontSizeRatio !== undefined) {
          frame = { ...frame, height: geo.fontSizeRatio * DEFAULT_TEXT_LINE_HEIGHT };
        }
        // WI-051 follow-up — fit the box to the measured content (flag-gated).
        const fsHug =
          typeof attrsOverride.fontSize === "number"
            ? attrsOverride.fontSize
            : defaultAttrsFor("text").fontSize;
        frame = hugFreeTextFrame(doc, containerId, frame, designWidth, designHeight, fsHug);
      }
      const result = editor.exec<unknown, string>("weave.item.add", {
        kind: spec.kind,
        containerId,
        frame,
        ...(Object.keys(attrsOverride).length > 0 ? { attrsOverride } : {}),
      });
      if (result.ok) setSelectedFrameIdRef.current?.(result.value);
      if (intoSelectedFrame) {
        const box = absoluteFrameBox(doc, containerId, designWidth, designHeight);
        if (box !== null) cameraFitBox(box);
      }
    });
  }, [
    editor,
    designWidth,
    designHeight,
    docRef,
    selectedFrameIdRef,
    setSelectedFrameIdRef,
    addGeometryRef,
    resolveAddContainerRef,
  ]);

  // WI-030 — Slide preset picker open state. The Add menu's "슬라이드" item opens
  // this dialog instead of immediately inserting a blank slide.
  const [slidePickerOpen, setSlidePickerOpen] = useState(false);

  return { addNewItem, slidePickerOpen, setSlidePickerOpen };
}
