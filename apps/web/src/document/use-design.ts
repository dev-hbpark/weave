// Phase 10b — `useDesign` is the Design-rooted successor to `useDocument`.
// State shape: `Design` (absolute px width × height) hosting an
// `AgocraftDocument` whose every item carries a `frame` (0..1 parent-relative).
// All editor mutations flow through `applyChange`; the legacy direct setters
// are kept only as escape hatches for non-event-sourced commands (`reset`).

import type { Document as AgocraftDocument, Unit as AgocraftUnit, Change } from "@agocraft/core";
import { unitId as makeUnitId } from "@agocraft/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDesignCloud } from "./cloud-sync.js";
import {
  addChild,
  applyChangeToDocument,
  ensureRootStyleProvider,
  type PendingCreationLookup,
  removeChild,
  reorderRootChildren,
  toAgocraftItem,
  updateAttrs,
  updateChild,
  updateUnitAttrs,
} from "./agocraft-mirror.js";
import { createDefaultItem } from "./seed.js";
import {
  createBlankDesign,
  hydrateSerializedDesign,
  loadDesign,
  removeLocalDesign,
  saveDesign,
  saveDesignAwaitable,
  type SerializedDesignV5,
} from "./storage.js";
import { resolveStoredColor } from "./style/resolver.js";
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
  /** Awaitable variant of `persistNow`. Builds the same blob and
   *  POSTs it to the cloud, but returns whether the round-trip
   *  succeeded so callers (currently the header manual-save button)
   *  can flip the UI to a failure state on `false`. */
  readonly persistNowAwaitable: () => Promise<boolean>;
  /** True while the LS-miss cloud fallback is mid-fetch — the
   *  initial Design returned from this hook is a blank placeholder
   *  that the host should mask behind a spinner until the real blob
   *  arrives (or the fetch fails, in which case this flips to false
   *  and the blank becomes the live editing target). Always `false`
   *  when LS already had the design, so well-behaved hosts can render
   *  the spinner unconditionally on `isLoading`. */
  readonly isLoading: boolean;
  /** True when an UNSYNCED OFFLINE EDIT for this id was found in
   *  localStorage on open. The hook paints that offline copy (so the
   *  user sees their unsynced work) and the host must surface a
   *  reconcile prompt — resolve it via `resolveLocalConflict`. False in
   *  the normal online path (no local copy → loaded from the cloud). */
  readonly localConflict: boolean;
  /** Resolve the offline-edit prompt:
   *   • "save"    — save the painted offline copy to the server as a NEW
   *                 design (fresh id), leaving the original server design
   *                 untouched. On success the original id's outbox entry
   *                 is dropped and `newDesignId` carries the new design's
   *                 id so the host can navigate to it. `ok` is false when
   *                 the round-trip fails (the edit stays in the outbox).
   *   • "discard" — drop the offline copy and load the server version
   *                 (blank if the server has none). Always resolves `ok`.
   *  Clears `localConflict` either way. */
  readonly resolveLocalConflict: (
    choice: "save" | "discard",
  ) => Promise<{ ok: boolean; newDesignId?: string }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Fresh design id — same shape as `NewDesignWizard.makeDesignId` /
 *  `LandingPage.makeDuplicateDesignId` (matches `isValidId`). Used when an
 *  offline edit is reconciled by saving it as a new design. */
function makeDesignId(): string {
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function withDocument(design: Design, document: AgocraftDocument): Design {
  return {
    ...design,
    document,
    meta: { ...design.meta, updatedAt: nowIso() },
  };
}

/** Resolve the initial Design for `id`.
 *
 *  `source` discriminates the open path under the offline-first model:
 *   • "local" — a `weave.design.v5.<id>` entry exists. Under this model
 *     that is an UNSYNCED OFFLINE EDIT, never a sync cache. We paint it
 *     (so the user sees their unsynced work) and the host prompts to
 *     reconcile it against the server (`localConflict`).
 *   • "blank" — no local copy. The returned Design is a blank placeholder
 *     and the host fetches the authoritative copy from the cloud (or
 *     keeps the blank for a brand-new design the cloud doesn't have yet). */
function initialDesign(id: string): {
  readonly design: Design;
  readonly source: "local" | "blank";
} {
  const local = loadDesign(id);
  if (local !== undefined) return { design: local, source: "local" };
  return {
    design: createBlankDesign({ id, title: "Untitled design", width: 1920, height: 1080 }),
    source: "blank",
  };
}

export function useDesign(id: string): UseDesignResult {
  const initial = useRef<{ readonly design: Design; readonly source: "local" | "blank" }>();
  if (initial.current === undefined) initial.current = initialDesign(id);
  const [design, setDesign] = useState<Design>(initial.current.design);
  // Spinner gate. True only on the "blank" path (= the cloud fetch below
  // will fire); on a local-conflict open we already have a copy to paint,
  // so no spinner — the reconcile dialog masks the editor instead.
  const [isLoading, setIsLoading] = useState<boolean>(initial.current.source === "blank");
  // True when the open found an unsynced offline edit. The host renders
  // the reconcile prompt; `resolveLocalConflict` clears it.
  const [localConflict, setLocalConflict] = useState<boolean>(
    initial.current.source === "local",
  );

  // Mirror the latest Design into a ref so persistNow can read it without
  // re-creating the callback on every render. setDesign batching means the
  // ref is updated synchronously on the very next render after a mutation.
  const designRef = useRef<Design>(design);
  designRef.current = design;

  // Ref mirror so the stable persist callbacks can read the current
  // conflict state. While an offline edit is UNRESOLVED, persistence is
  // suppressed: the live editor must not auto-sync the painted offline
  // copy back to the server under the original id (that would silently
  // overwrite the server version before the user picks save/discard).
  const localConflictRef = useRef<boolean>(localConflict);
  localConflictRef.current = localConflict;

  // Cloud fetch on mount — ONLY on the "blank" path (no local copy). The
  // cloud is authoritative for designs, so this is where a reopened design
  // picks up edits saved from this or another device. A "local" open does
  // NOT fetch here: that copy is an unsynced offline edit and must not be
  // silently overwritten — the host prompts and `resolveLocalConflict`
  // decides. Race-protected by reference-equality against the mount
  // snapshot: a user who started editing the blank before the cloud
  // replied has rotated `designRef.current`, so we leave their work intact.
  const designAtMountRef = useRef(initial.current.design);
  useEffect(() => {
    if (initial.current?.source !== "blank") return undefined;
    let cancelled = false;
    void (async () => {
      const raw = await fetchDesignCloud(id);
      if (cancelled) return;
      if (raw === null) {
        setIsLoading(false);
        return;
      }
      if (designRef.current !== designAtMountRef.current) {
        setIsLoading(false);
        return;
      }
      const hydrated = hydrateSerializedDesign(raw as unknown as SerializedDesignV5);
      if (hydrated === undefined) {
        setIsLoading(false);
        return;
      }
      setDesign(hydrated);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Resolve the offline-edit prompt. "save" persists the painted offline
  // copy to the server as a NEW design (fresh id + title suffix), leaving
  // the original server design untouched — so neither the offline edit nor
  // the server version is lost. The host navigates to the returned new id.
  // "discard" throws away the offline copy and loads the server version
  // (blank when the cloud has none — a design that only ever existed
  // offline).
  const resolveLocalConflict = useCallback(
    async (choice: "save" | "discard"): Promise<{ ok: boolean; newDesignId?: string }> => {
      if (choice === "save") {
        const current = designRef.current;
        const newId = makeDesignId();
        const now = nowIso();
        const newDesign: Design = {
          ...current,
          id: newId,
          title: `${current.title} (오프라인 사본)`,
          meta: { ...current.meta, createdAt: now, updatedAt: now },
        };
        const ok = await saveDesignAwaitable(newDesign);
        if (ok) {
          // The offline edit now lives on the server as a new design — drop
          // the ORIGINAL id's outbox so reopening it no longer prompts.
          removeLocalDesign(id);
          // Intentionally leave `localConflict` TRUE: it keeps persistence
          // gated (so a late debounced auto-save can't overwrite the
          // original id) until the host navigates to `newDesignId`, which
          // unmounts this hook and tears the dialog down with it.
          return { ok, newDesignId: newId };
        }
        // Failed round-trip parks `newDesign` in the outbox under `newId`;
        // we never navigate there, so clear that orphan and keep the
        // original outbox so the user can retry from this design. Release
        // the dialog so the user can keep editing offline.
        removeLocalDesign(newId);
        setLocalConflict(false);
        return { ok };
      }
      removeLocalDesign(id);
      setIsLoading(true);
      const raw = await fetchDesignCloud(id);
      const hydrated =
        raw === null ? undefined : hydrateSerializedDesign(raw as unknown as SerializedDesignV5);
      const current = designRef.current;
      setDesign(
        hydrated ??
          createBlankDesign({
            id,
            title: current.title,
            width: current.width,
            height: current.height,
          }),
      );
      setIsLoading(false);
      setLocalConflict(false);
      return { ok: true };
    },
    [id],
  );

  // Persistence is no longer driven by useEffect on design changes —
  // useWeaveEditor wires a debounced ChangeStream sink to persistNow.
  // The first render still establishes the initial Design via initialDesign;
  // no save is needed on mount (the blob already came from loadDesign or is
  // brand new from createBlankDesign and will be saved on the first user
  // mutation via the debounced sink).
  const persistNow = useCallback(() => {
    // Suppress auto-save while an offline edit is unresolved — see
    // `localConflictRef`. Resolution goes through `resolveLocalConflict`.
    if (localConflictRef.current) return;
    saveDesign(designRef.current);
  }, []);
  const persistNowAwaitable = useCallback(async () => {
    if (localConflictRef.current) return false;
    return saveDesignAwaitable(designRef.current);
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

  // WI-032 Phase 3b — `updateShape` / `removeShape` callbacks edited the
  // legacy `canvas-design.attrs.shapes[]` payload. Shape primitives are
  // first-class Items now; their attrs flow through `updateItem`.

  const reset = useCallback(() => {
    setDesign((prev) =>
      createBlankDesign({ id: prev.id, title: prev.title, width: prev.width, height: prev.height }),
    );
  }, []);

  // WI-029 R1 Step 1 — wrapper-mirror from doc.attrs.
  //
  // The new HANDOFF-007 patches (`document.attrs`, `item.children.reorder`)
  // write to the agocraft Document; for Cmd+Z and remote-sync coherence the
  // wrapper-level fields (`design.background`, `design.presentationOrder`)
  // must mirror what's in `doc.attrs`. Reading from doc.attrs every render
  // would scatter the lookup; this single mirror in `applyChange` keeps the
  // wrapper authoritative for legacy readers without forcing every caller
  // to migrate today.
  //
  // Step 2 (use-weave-editor proxy that wires `setDesignBackground` →
  // `editor.exec("weave.design.setBackground")` so the legacy setters
  // become history-aware) lands in a follow-up PR with the Phase 1.5
  // schema migration. Until then, direct setter calls still bypass history;
  // editor.exec-driven calls flow through this mirror and undo correctly.
  const applyChange = useCallback((change: Change, pending?: PendingCreationLookup) => {
    setDesign((prev) => {
      const nextDoc = applyChangeToDocument(prev.document, change, pending);
      const docAttrs = (nextDoc.attrs ?? {}) as Readonly<Record<string, unknown>>;
      const bg = docAttrs.background;
      const order = docAttrs.presentationOrder;
      // WI-040 — bg may be a raw CSS string OR a `StyleRef` written by
      // `weave.design.setBackground` when the user picked a theme color.
      // Resolve via the cascade walker so the wrapper-level
      // `Design.background` stays a CSS string for legacy consumers.
      const resolvedBg = resolveStoredColor(nextDoc, bg, nextDoc.root, prev.background);
      const mirroredBg =
        resolvedBg !== undefined && resolvedBg !== prev.background ? resolvedBg : prev.background;
      const mirroredOrder =
        Array.isArray(order) &&
        order.every((s) => typeof s === "string") &&
        !shallowEqualStringArray(order as ReadonlyArray<string>, prev.presentationOrder)
          ? (order as ReadonlyArray<string>)
          : prev.presentationOrder;
      return {
        ...withDocument(prev, nextDoc),
        background: mirroredBg,
        presentationOrder: mirroredOrder,
      };
    });
  }, []);

  // Wrapper helper — narrow shallow equality for the presentationOrder
  // mirror guard above. Avoids React state churn when the patched array
  // is identical to the wrapper's current array.
  function shallowEqualStringArray(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // WI-028 Phase 3b — replace the entire Document from a remote source
  // (CRDT-derived Y.Doc). The Document mutation rule (editor.exec → ChangeStream
  // → History) governs USER mutations; remote sync is a state-load boundary,
  // same shape as the initial mount via `initialDesign`. History stays empty
  // for remote ops because we cannot undo someone else's edit anyway.
  const replaceDocument = useCallback((next: AgocraftDocument) => {
    // WI-040 — back-fill the root style.provider if the remote actor's
    // doc snapshot pre-dates the cascade. Cheap (no-op when already
    // present) and idempotent across multiple remote applies.
    setDesign((prev) => withDocument(prev, ensureRootStyleProvider(next)));
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
    reset,
    applyChange,
    replaceDocument,
    setPresentationOrder,
    reorderRootChildren: reorderRootChildrenCb,
    addBehavior,
    setDesignBackground,
    persistNow,
    persistNowAwaitable,
    isLoading,
    localConflict,
    resolveLocalConflict,
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
