import type { Document as AgocraftDocument, LayoutChildPolicy } from "@agocraft/core";
import type { Editor, SelectionChromeRegistry } from "@agocraft/editor";
import { useEffect, useRef } from "react";
import { findItemDeep } from "../../../document/agocraft-mirror.js";
import { createFrameDefaultViewModel } from "../../../document/selection-chrome/frame-default-view-model.js";
import { createPolyVertexHandleViewModel } from "../../../document/selection-chrome/poly-vertex-handle.js";
import { createShapeSelectionViewModel } from "../../../document/selection-chrome/shape-selection-view-model.js";
import { createSlideBulletHandleViewModel } from "../../../document/selection-chrome/slide-bullet-handle.js";
import { createTextSelectionViewModel } from "../../../document/selection-chrome/text-selection-view-model.js";
import { registerZOrderAdapters } from "../../../document/zorder/register.js";

// DR-027 / WI-071 Phase 2 — extracted from DesignPageBody (DR-023 selection-
// chrome ownership cluster). Behavior-preserving. Registers every item-kind
// view-model (DR-018 slide bullet, default resize/rotate for plain kinds, text
// auto-resize gating, shape line-subkind gating, DR-031/DR-025 poly+line vertex
// handles) plus the WI-019 z-order capability adapter.
//
// Cooperating hook (DR-027 Surface E):
//   • `docRef` is the orchestrator-owned live-document mirror (shared by ~18
//     other call sites) — injected so every VM reads current attrs without
//     re-registering (the poly-vertex-handle stale-closure pattern).
//   • `selectFrameRef` is OWNED here (the re-select-on-break / re-select-on-snap
//     target) but ASSIGNED by the orchestrator after useSelection initialises —
//     returned so the orchestrator can keep `selectFrameRef.current = selectFrame`.
// No `switch (kind)` is introduced — one registered adapter per kind (Rule 6).

export interface UseSelectionChromeRegistryParams {
  readonly selectionChrome: SelectionChromeRegistry;
  readonly editor: Editor;
  /** Orchestrator-owned live-document mirror; VM closures read `.current`. */
  readonly docRef: React.MutableRefObject<AgocraftDocument>;
}

export interface UseSelectionChromeRegistry {
  /** Owned here; the orchestrator assigns `.current = selectFrame` post-useSelection. */
  readonly selectFrameRef: React.MutableRefObject<(id: string) => void>;
}

export function useSelectionChromeRegistry({
  selectionChrome,
  editor,
  docRef,
}: UseSelectionChromeRegistryParams): UseSelectionChromeRegistry {
  // DR-018 PoC — register slide-only "add bullet" handle. The default
  // resize / rotate set continues to render alongside; registry merges.
  useEffect(() => {
    return selectionChrome.registerItemViewModel(createSlideBulletHandleViewModel({ editor }));
  }, [selectionChrome, editor]);

  // DR-023 — each item kind OWNS its selection chrome via a registered
  // view-model (no central god-resolver in FrameStage). Plain kinds get the
  // default 8-resize + rotate set; `text` gates resize dirs by auto-resize mode;
  // `shape` drops box-resize for line-type sub-kinds. Mode/sub-kind reads go
  // through docRef so the VM always sees live attrs.
  useEffect(() => {
    const disposers = [
      ...(["frame", "image", "video", "qr", "chart"] as const).map((k) =>
        selectionChrome.registerItemViewModel(createFrameDefaultViewModel({ itemKind: k })),
      ),
      selectionChrome.registerItemViewModel(
        createTextSelectionViewModel({
          getLayoutChild: (itemId) => {
            const item = findItemDeep(docRef.current, itemId);
            return (item?.attrs as { layoutChild?: LayoutChildPolicy } | undefined)?.layoutChild;
          },
        }),
      ),
      selectionChrome.registerItemViewModel(
        createShapeSelectionViewModel({
          getSubAttrs: (itemId) => {
            const item = findItemDeep(docRef.current, itemId);
            return (item?.attrs as { subAttrs?: { shape?: string; closed?: boolean } } | undefined)
              ?.subAttrs;
          },
        }),
      ),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [selectionChrome, docRef]);

  // WI-065 / DR-031 — re-select helper held in a ref so the vertex-handle VM
  // (registered once, deps [selectionChrome, editor]) never closes over a stale
  // `selectFrame`. Assigned by the orchestrator once the selection hook is up.
  const selectFrameRef = useRef<(id: string) => void>(() => {});

  // WI-057 Phase 2 — draggable vertex handles for freeform `poly` shapes. The
  // view-model reads live vertices through docRef; dragging dispatches
  // weave.shape.setVertices.
  useEffect(() => {
    return selectionChrome.registerItemViewModel(
      createPolyVertexHandleViewModel({
        editor,
        getPoly: (itemId) => {
          const item = findItemDeep(docRef.current, itemId);
          const attrs = item?.attrs as
            | {
                subAttrs?: {
                  shape?: string;
                  points?: ReadonlyArray<{ x: number; y: number; smooth?: boolean }>;
                  closed?: boolean;
                  smooth?: boolean;
                };
                frame?: { x: number; y: number; width: number; height: number; rotation?: number };
              }
            | undefined;
          const sub = attrs?.subAttrs;
          if (sub?.shape !== "poly" || attrs?.frame === undefined) return null;
          return {
            points: sub.points ?? [],
            closed: sub.closed ?? true,
            frame: attrs.frame,
            // DR-033 — global fallback for per-vertex type.
            ...(sub.smooth !== undefined ? { smooth: sub.smooth } : {}),
          };
        },
        // WI-065 / DR-031 — right-click a vertex breaks the poly into a `line`
        // at exactly that vertex, then re-selects the new line via the ref.
        onBreakAtVertex: (id, vertexIndex) => {
          const r = editor.exec<unknown, string>("weave.shape.breakToLine", {
            itemId: id,
            vertexIndex,
          });
          if (r.ok) selectFrameRef.current(r.value);
        },
      }),
    );
  }, [selectionChrome, editor, docRef]);

  // DR-025 / WI-062 — same vertex/endpoint editing for the `line` kind, but its
  // points live on `attrs.points` (not `subAttrs`) and it is always open. No
  // frame-default VM is registered for "line", so a selected line shows ONLY
  // these handles (no resize / rotate) + the outline.
  useEffect(() => {
    return selectionChrome.registerItemViewModel(
      createPolyVertexHandleViewModel({
        editor,
        itemKind: "line",
        getPoly: (itemId) => {
          const item = findItemDeep(docRef.current, itemId);
          if (item?.kind !== "line") return null;
          const attrs = item.attrs as {
            points?: ReadonlyArray<{ x: number; y: number; smooth?: boolean }>;
            smooth?: boolean;
            frame?: { x: number; y: number; width: number; height: number; rotation?: number };
          };
          if (attrs.frame === undefined) return null;
          return {
            points: attrs.points ?? [],
            closed: false,
            frame: attrs.frame,
            ...(attrs.smooth !== undefined ? { smooth: attrs.smooth } : {}),
          };
        },
        composeAttrs: (prev, frame, points) => ({
          ...prev,
          ...(frame !== undefined ? { frame } : {}),
          points,
        }),
        // WI-070 — an endpoint free-moved (Alt) and SNAPPED onto the opposite
        // endpoint: fuse the two ends and close the line into a filled shape,
        // then re-select the fresh shape via the ref.
        onCloseBySnap: (id) => {
          const r = editor.exec<unknown, string>("weave.line.closeToShape", {
            itemId: id,
            fuseEndpoints: true,
          });
          if (r.ok) selectFrameRef.current(r.value);
        },
      }),
    );
  }, [selectionChrome, editor, docRef]);

  // WI-019 Phase 3 — register design-frame ZOrderCapability adapter for the 4
  // top-level Frame kinds. Adapter reads through docRef so it always sees the
  // latest document mirror without re-registering on every doc change.
  useEffect(() => {
    return registerZOrderAdapters({
      capabilityRegistry: editor.capabilities,
      getDocument: () => docRef.current,
    });
  }, [editor, docRef]);

  return { selectFrameRef };
}
