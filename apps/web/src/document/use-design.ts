// Phase 10b — `useDesign` is the Design-rooted successor to `useDocument`.
// State shape: `Design` (absolute px width × height) hosting an
// `AgocraftDocument` whose every item carries a `frame` (0..1 parent-relative).
// All editor mutations flow through `applyChange`; the legacy direct setters
// are kept only as escape hatches for non-event-sourced commands (`reset`).

import type { Document as AgocraftDocument, Unit as AgocraftUnit, Change } from "@agocraft/core";
import { unitId as makeUnitId } from "@agocraft/core";
import { useCallback, useRef, useState } from "react";
import {
  addChild,
  applyChangeToDocument,
  type PendingCreationLookup,
  removeChild,
  reorderRootChildren,
  toAgocraftItem,
  updateAttrs,
  updateChild,
  updateUnitAttrs,
} from "./agocraft-mirror.js";
import { createDefaultItem } from "./seed.js";
import { createBlankDesign, loadDesign, saveDesign } from "./storage.js";
import type {
  CanvasAttrs,
  CanvasShape,
  Design,
  DomainKind,
  InteractionBehavior,
  Item,
} from "./types.js";

interface UseDesignResult {
  readonly design: Design;
  readonly docInAgocraft: AgocraftDocument;
  readonly addItem: (kind: DomainKind, containerId?: string) => void;
  readonly removeItem: (itemId: string) => void;
  readonly updateBehavior: (
    itemId: string,
    behaviorId: string,
    patch: (b: InteractionBehavior) => InteractionBehavior,
  ) => void;
  readonly updateItem: (itemId: string, patch: (it: Item) => Item) => void;
  readonly updateShape: (itemId: string, shapeId: string, patch: Partial<CanvasShape>) => void;
  readonly removeShape: (itemId: string, shapeId: string) => void;
  readonly reset: () => void;
  readonly applyChange: (change: Change, pending?: PendingCreationLookup) => void;
  /** WI-028 Phase 3b — replace the entire Document with a CRDT-derived one
   *  (remote actor edited the shared doc). Bypasses History; see comment in
   *  use-design.ts. */
  readonly replaceDocument: (next: AgocraftDocument) => void;
  /** Phase 10c — overwrite the design's presentation order. Pass the full
   *  next array (use `reorder` / spread to build it). Tree positions are not
   *  touched. */
  readonly setPresentationOrder: (next: ReadonlyArray<string>) => void;
  /** WI-019 Phase 3 — reorder root.children in z-ascending order. Used by
   *  usePeekMode's onCommit for the peek drag drop. Items not mentioned in
   *  `orderedAsc` retain their relative position at the end. */
  readonly reorderRootChildren: (orderedAsc: ReadonlyArray<string>) => void;
  /** Phase 13c — append an interaction behavior (camera-target / hotspot /
   *  reveal-on-step / future kinds) to a frame's units. Returns the new
   *  unit id for callers that want to immediately edit it. */
  readonly addBehavior: (itemId: string, behavior: InteractionBehavior) => string;
  /** Set the design's overall background CSS color (paints the canvas
   *  behind every frame). Persists via the existing storage pipeline. */
  readonly setDesignBackground: (color: string) => void;
  /** Snapshot the latest in-memory Design and write it through
   *  `saveDesign` (localStorage + cloud mirror). Invoked by
   *  `useWeaveEditor`'s debounced ChangeStream sink — see OS Rule 4 +
   *  agocraft `scheduling.debounce`. Renders stay immediate while
   *  persistence batches at the consumer's schedule. */
  readonly persistNow: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function withDocument(design: Design, document: AgocraftDocument): Design {
  return {
    ...design,
    document,
    meta: { ...design.meta, updatedAt: nowIso() },
  };
}

/** Resolve the initial Design for `id`. Loads from storage if present, else
 *  builds a blank Design with the default 1920×1080 preset. */
function initialDesign(id: string): Design {
  const loaded = loadDesign(id);
  if (loaded !== undefined) return loaded;
  return createBlankDesign({ id, title: "Untitled design", width: 1920, height: 1080 });
}

export function useDesign(id: string): UseDesignResult {
  const [design, setDesign] = useState<Design>(() => initialDesign(id));

  // Mirror the latest Design into a ref so persistNow can read it without
  // re-creating the callback on every render. setDesign batching means the
  // ref is updated synchronously on the very next render after a mutation.
  const designRef = useRef<Design>(design);
  designRef.current = design;

  // Persistence is no longer driven by useEffect on design changes —
  // useWeaveEditor wires a debounced ChangeStream sink to persistNow.
  // The first render still establishes the initial Design via initialDesign;
  // no save is needed on mount (the blob already came from loadDesign or is
  // brand new from createBlankDesign and will be saved on the first user
  // mutation via the debounced sink).
  const persistNow = useCallback(() => {
    saveDesign(designRef.current);
  }, []);

  const addItem = useCallback((kind: DomainKind, containerId?: string) => {
    setDesign((prev) => {
      let maxOrder = -1;
      const target =
        containerId === undefined
          ? prev.document.root
          : findInTree(prev.document.root, containerId);
      const scope = target?.children ?? prev.document.root.children;
      for (const child of scope) {
        for (const u of child.units) {
          if (u.kind === "camera-target") {
            const behavior = u.attrs.behavior as { order?: number } | undefined;
            if (behavior?.order !== undefined && behavior.order > maxOrder) {
              maxOrder = behavior.order;
            }
          }
        }
      }
      const weaveItem = createDefaultItem(kind, maxOrder + 1);
      const agoItem = toAgocraftItem(weaveItem, nowIso());
      return withDocument(prev, addChild(prev.document, agoItem, containerId));
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setDesign((prev) => withDocument(prev, removeChild(prev.document, itemId)));
  }, []);

  const updateBehavior = useCallback(
    (
      itemId: string,
      behaviorId: string,
      patch: (b: InteractionBehavior) => InteractionBehavior,
    ) => {
      setDesign((prev) =>
        withDocument(
          prev,
          updateChild(prev.document, itemId, (item) => {
            const unit = item.units.find((u) => String(u.id) === behaviorId);
            if (unit === undefined) return item;
            const current = unit.attrs.behavior as InteractionBehavior | undefined;
            if (current === undefined) return item;
            return updateUnitAttrs(item, behaviorId, { behavior: patch(current) });
          }),
        ),
      );
    },
    [],
  );

  const updateItem = useCallback((itemId: string, patch: (it: Item) => Item) => {
    setDesign((prev) =>
      withDocument(
        prev,
        updateChild(prev.document, itemId, (item) => {
          const weaveItem: Item = {
            id: String(item.id),
            kind: item.kind as DomainKind,
            attrs: item.attrs as unknown as Item["attrs"],
            behaviors: [],
            createdAt: item.meta.createdAt,
          };
          const next = patch(weaveItem);
          return updateAttrs(item, next.attrs as unknown as Readonly<Record<string, unknown>>);
        }),
      ),
    );
  }, []);

  const updateShape = useCallback(
    (itemId: string, shapeId: string, patch: Partial<CanvasShape>) => {
      setDesign((prev) =>
        withDocument(
          prev,
          updateChild(prev.document, itemId, (item) => {
            if (item.kind !== "canvas-design") return item;
            const attrs = item.attrs as unknown as CanvasAttrs;
            const nextShapes = attrs.shapes.map((s) => (s.id === shapeId ? { ...s, ...patch } : s));
            return updateAttrs(item, { shapes: nextShapes });
          }),
        ),
      );
    },
    [],
  );

  const removeShape = useCallback((itemId: string, shapeId: string) => {
    setDesign((prev) =>
      withDocument(
        prev,
        updateChild(prev.document, itemId, (item) => {
          if (item.kind !== "canvas-design") return item;
          const attrs = item.attrs as unknown as CanvasAttrs;
          const nextShapes = attrs.shapes.filter((s) => s.id !== shapeId);
          return updateAttrs(item, { shapes: nextShapes });
        }),
      ),
    );
  }, []);

  const reset = useCallback(() => {
    setDesign((prev) =>
      createBlankDesign({ id: prev.id, title: prev.title, width: prev.width, height: prev.height }),
    );
  }, []);

  const applyChange = useCallback((change: Change, pending?: PendingCreationLookup) => {
    setDesign((prev) => withDocument(prev, applyChangeToDocument(prev.document, change, pending)));
  }, []);

  // WI-028 Phase 3b — replace the entire Document from a remote source
  // (CRDT-derived Y.Doc). The Document mutation rule (editor.exec → ChangeStream
  // → History) governs USER mutations; remote sync is a state-load boundary,
  // same shape as the initial mount via `initialDesign`. History stays empty
  // for remote ops because we cannot undo someone else's edit anyway.
  const replaceDocument = useCallback((next: AgocraftDocument) => {
    setDesign((prev) => withDocument(prev, next));
  }, []);

  const setPresentationOrder = useCallback((next: ReadonlyArray<string>) => {
    setDesign((prev) => ({
      ...prev,
      presentationOrder: next,
      meta: { ...prev.meta, updatedAt: nowIso() },
    }));
  }, []);

  const reorderRootChildrenCb = useCallback((orderedAsc: ReadonlyArray<string>) => {
    setDesign((prev) => withDocument(prev, reorderRootChildren(prev.document, orderedAsc)));
  }, []);

  const setDesignBackground = useCallback((color: string) => {
    setDesign((prev) => ({
      ...prev,
      background: color,
      meta: { ...prev.meta, updatedAt: nowIso() },
    }));
  }, []);

  const addBehavior = useCallback((itemId: string, behavior: InteractionBehavior): string => {
    const newId = behavior.id;
    setDesign((prev) =>
      withDocument(
        prev,
        updateChild(prev.document, itemId, (item) => {
          const ts = nowIso();
          const newUnit: AgocraftUnit = {
            id: makeUnitId(newId),
            kind: behavior.kind,
            attrs: { behavior: behavior as unknown as Readonly<Record<string, unknown>> },
            meta: { schemaVersion: 5 } as AgocraftUnit["meta"],
          };
          void ts;
          return {
            ...item,
            units: [...item.units, newUnit],
            meta: { ...item.meta, updatedAt: ts },
          };
        }),
      ),
    );
    return newId;
  }, []);

  return {
    design,
    docInAgocraft: design.document,
    addItem,
    removeItem,
    updateBehavior,
    updateItem,
    updateShape,
    removeShape,
    reset,
    applyChange,
    replaceDocument,
    setPresentationOrder,
    reorderRootChildren: reorderRootChildrenCb,
    addBehavior,
    setDesignBackground,
    persistNow,
  };
}

function findInTree(
  item: import("@agocraft/core").Item,
  id: string,
): import("@agocraft/core").Item | undefined {
  if (String(item.id) === id) return item;
  for (const c of item.children) {
    const f = findInTree(c, id);
    if (f !== undefined) return f;
  }
  return undefined;
}
