// WI-013 Phase 1 — single `@agocraft/editor` instance per route, backed by the
// weave Document mirror. `getDocument` reads from a ref so the editor always
// sees the latest mirror without recreating the editor on every doc change.

import {
  type Change,
  type ChangeSink,
  ClockToken,
  type Document as AgocraftDocument,
  createCapabilityRegistry,
  createChangeStream,
  createContainer,
  createFeatureRegistry,
  createRelationRegistry,
  createSchema,
  createUuidV7Generator,
  defaultClock,
  defaultRandom,
  IdGeneratorToken,
  type Patch,
  scheduling,
} from "@agocraft/core";
import {
  applyPatchToYDoc,
  createHttpPollProvider,
  createSyncEngine,
  generateActorId,
  seedYDocFromDocument,
  type SyncEngine,
} from "@agocraft/sync";
import * as Y from "yjs";
import {
  canonicalToViewport,
  createEditor,
  createEditorViewModel,
  createGestureRouter,
  createPlainCamera,
  createSelectionChromeRegistry,
  DEFAULT_COORDINATE_SYSTEM,
  type Editor,
  type EditorViewModel,
  type GestureRouter,
  type HostRect,
  type SelectionChromeRegistry,
  toCanonical,
} from "@agocraft/editor";
import { useEffect, useMemo, useRef } from "react";
import type { PendingCreationLookup } from "./agocraft-mirror.js";
import {
  createPendingCreations,
  type PendingCreations,
  registerWeaveCommands,
  type WeaveCommandTargets,
} from "./commands.js";
import { bridgeCanvasShapeIntoAgocraft } from "./manipulation/agocraft-bridge.js";
import { createCanvasShapeCapability } from "./manipulation/capabilities/canvas-shape.js";

export interface UseWeaveEditorDeps {
  /** Latest agocraft Document mirror (from useDocument.docInAgocraft). */
  readonly docInAgocraft: AgocraftDocument;
  /** Command targets — useDocument's setter callbacks. If provided, the editor
   *  registers `weave.*` commands routed through these. (Phase 2 — local
   *  weave state stays source of truth; Phase 2b returns real Patches.) */
  readonly commandTargets?: WeaveCommandTargets;
  /** Phase 4b / 5 — apply a Change emitted by the editor's TransactionRunner
   *  back into useDocument's agocraft Document state. The bridge inside this
   *  hook subscribes to `editor.changeStream` and calls this callback for each
   *  user-command / system Change. The optional `pending` lookup resolves
   *  `item.children` added Patches against newly-staged Items. */
  readonly applyChange?: (change: Change, pending?: PendingCreationLookup) => void;
  /** Persistence sink invoked on a debounced ChangeStream subscription.
   *  Rendering still receives every Change immediately via `applyChange`;
   *  this callback fires at most once per `persistDebounceMs` window so
   *  storage I/O batches across rapid edits. See OS-root Rule 4 + agocraft
   *  `scheduling.debounce`. */
  readonly persist?: () => void;
  /** Trailing-edge debounce for the persist sink. Default 3000ms. */
  readonly persistDebounceMs?: number;
  /** WI-028 Phase 3 — enable collaborative sync. When set, the hook
   *  wires a SyncEngine + Y.Doc + HttpPollProvider to the editor's
   *  ChangeStream so local edits mirror into the Y.Doc and push to the
   *  /api/sync/<roomId> backend. Default off — full-PUT storage stays
   *  the active path until the host is ready to opt in. */
  readonly sync?: {
    /** Room id — typically the design.id. One Y.Doc per room. */
    readonly roomId: string;
    /** Base URL of the sync API. Default `"/api/sync/<roomId>"`. */
    readonly endpoint?: string;
    /** Override the local actor id (cookie / auth integration). */
    readonly actorId?: string;
  };
}

export interface UseWeaveEditorSync {
  readonly engine: SyncEngine;
  readonly yDoc: Y.Doc;
}

/** Build an Editor wired to the weave doc mirror. The Editor itself is stable
 *  (same instance across renders); only its `getDocument` resolves to the
 *  latest mirror via a ref. Slots and DocumentType registration happen once. */
export interface UseWeaveEditorResult {
  readonly editor: Editor;
  readonly vm: EditorViewModel;
  /** DR-017 Phase 2 — single GestureRouter for the editor session. */
  readonly router: GestureRouter;
  /** DR-018 — selection chrome registry. Item kinds register their
   *  selection view-models (`registerItemViewModel`); cross-cutting
   *  plugins register generic providers (`registerProvider`).
   *  NestedFrame / CanvasBlock consult this on every selection. */
  readonly selectionChrome: SelectionChromeRegistry;
  /** WI-028 — collaborative sync engine. `undefined` when `deps.sync`
   *  isn't supplied; otherwise the engine + Y.Doc the host can wire
   *  into presence UI, snapshot scheduling, etc. */
  readonly sync: UseWeaveEditorSync | undefined;
}

export function useWeaveEditor(deps: UseWeaveEditorDeps): UseWeaveEditorResult {
  const docRef = useRef<AgocraftDocument>(deps.docInAgocraft);
  // Sync the ref *during render* so the very first dispatch (before any effect
  // has run) already sees the latest mirror. useEffect would defer the update
  // a tick and produce stale reads.
  docRef.current = deps.docInAgocraft;
  // Same trick for command targets — the closure inside commands.ts reads
  // through `targetsRef.current` so each exec sees the latest callbacks
  // (which themselves are stable across renders because useDocument
  // useCallback's them, but we belt-and-suspenders here).
  const targetsRef = useRef<WeaveCommandTargets | undefined>(deps.commandTargets);
  targetsRef.current = deps.commandTargets;
  const applyChangeRef = useRef<UseWeaveEditorDeps["applyChange"]>(deps.applyChange);
  applyChangeRef.current = deps.applyChange;
  const persistRef = useRef<UseWeaveEditorDeps["persist"]>(deps.persist);
  persistRef.current = deps.persist;

  const editor = useMemo<Editor>(() => {
    const container = createContainer();
    container.bind({ token: ClockToken, scope: "singleton", factory: () => defaultClock });
    container.bind({
      token: IdGeneratorToken,
      scope: "singleton",
      factory: () => createUuidV7Generator(defaultClock, defaultRandom),
    });
    const schema = createSchema();
    const e = createEditor({
      container,
      changeStream: createChangeStream(),
      features: createFeatureRegistry(),
      relations: createRelationRegistry(),
      capabilities: createCapabilityRegistry(),
      schema,
      getDocument: () => docRef.current,
      historyMergeWindowMs: 500,
      // DR-019 — weave 의 컨벤션 명시: frame attrs 가 0..1 ratio, 원점
      // 좌상단, 디자인 plane 1920×1080. 명시화는 두 가지를 보장:
      //   (a) 다른 sister project 가 다른 컨벤션을 골라도 agocraft
      //       의 변환 일관성으로 영향 없음.
      //   (b) 모든 frame / shape / hotspot 산술이 single source
      //       (editor.coordSystem) 을 consult — 한 위치에서 변경.
      coordSystem: DEFAULT_COORDINATE_SYSTEM,
    });
    // Baseline slots so the idle-router has something to read. Plugins / DocumentType
    // contributions override later via registerSlot.
    e.registerSlot("hitTest", () => "selectable");
    e.registerSlot("dragMove", () => {});
    e.registerSlot("dragCommit", () => {});
    e.documentTypes.register({
      kind: "weave-doc",
      displayName: "Weave Document",
      // WI-020 — 3 new top-level kinds (DR-023) joining the original 4
      // domain frames. agocraft schema entries (IMAGE_KIND / VIDEO_KIND /
      // SHAPE_KIND) define the attr shapes.
      allowedChildKinds: [
        "slide", "canvas-design", "block-doc", "media",
        "image", "video", "shape",
      ],
      ux: {},
    });
    e.useDocumentType("weave-doc");
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // construct once; the ref carries doc changes.
  }, []);

  // DR-017 — EditorViewModel as the single source of transient view-state
  // (selection / mode / drill / hand-tool / camera / hover / gesture
  // lifecycle). vm.derived signals (canUndo / canRedo / selectedItemId /
  // selectedFrameBoundsViewport) auto-invalidate via the editor's
  // ChangeStream subscription.
  //
  // DR-019 — weave delegates coordinate projection to agocraft.
  // `toCanonical(frame, editor.coordSystem)` honours the host's
  // declared (space, origin) once; `canonicalToViewport(canonical,
  // camera)` then applies the camera. weave's specific knowledge
  // (where in the document tree to find the frame) stays here;
  // arithmetic stays in agocraft.
  const vm = useMemo<EditorViewModel>(() => {
    return createEditorViewModel({
      editor,
      camera: createPlainCamera(),
      projectFrameToViewport: (itemId, ctx) => {
        const doc = docRef.current;
        const child = findItemInDoc(doc, itemId);
        if (child === undefined) return null;
        const frame = (child.attrs as { frame?: HostRect }).frame;
        if (frame === undefined) return null;
        const canonical = toCanonical(frame, editor.coordSystem);
        return canonicalToViewport(canonical, {
          tx: ctx.cameraTx,
          ty: ctx.cameraTy,
          scale: ctx.cameraScale,
        });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- construct
    // once; vm reacts to editor.changeStream + camera/outerSize signals
    // internally.
  }, [editor]);

  const router = useMemo<GestureRouter>(
    () => createGestureRouter({ editor, vm }),
    [editor, vm],
  );

  const selectionChrome = useMemo<SelectionChromeRegistry>(
    () => createSelectionChromeRegistry(),
    [],
  );

  // WI-028 Phase 3a — collaborative sync. When `deps.sync` is supplied
  // the hook spins up a Y.Doc + HttpPollProvider + SyncEngine. The
  // Y.Doc is seeded once from the current agocraft document, then a
  // ChangeStream subscriber mirrors every local Patch into the Y.Doc
  // via `applyPatchToYDoc`. The Y.Doc's `update` observer (inside the
  // provider) pushes the binary delta to /api/sync/<roomId>/push.
  // Phase 3b will close the loop the other way (remote pulls → re-derive
  // agocraft Document → re-emit on ChangeStream as origin:"system").
  const syncConfig = deps.sync;
  const syncBundle = useMemo<UseWeaveEditorSync | undefined>(() => {
    if (syncConfig === undefined) return undefined;
    const yDoc = new Y.Doc();
    const endpoint = syncConfig.endpoint ?? `/api/sync/${syncConfig.roomId}`;
    const provider = createHttpPollProvider({ yDoc, endpoint });
    const actorId = syncConfig.actorId ?? generateActorId();
    const engine = createSyncEngine({ yDoc, provider, actorId });
    seedYDocFromDocument(yDoc, docRef.current);
    return { engine, yDoc };
    // Intentionally constructed once per editor session — the same
    // Y.Doc lives for the lifetime of this hook. Reseeding on every
    // doc change would clobber remote edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncConfig?.roomId]);

  useEffect(() => {
    if (syncBundle === undefined) return;
    syncBundle.engine.start();
    return () => syncBundle.engine.stop();
  }, [syncBundle]);

  // Intentionally no `disposeState()` cleanup — React 18 StrictMode runs the
  // mount/cleanup pair twice in dev, which would dispose the singleton machine
  // (`disposed = true`) and silently kill every subsequent dispatch. The
  // editor is per-route, so GC reclaims it when the route unmounts.

  // Phase 5 — side-channel for new Items. addItem command stages the full
  // AgocraftItem here; the reducer consumes on item.children-added.
  const pendingCreationsRef = useRef<PendingCreations | undefined>(undefined);
  if (pendingCreationsRef.current === undefined) {
    pendingCreationsRef.current = createPendingCreations();
  }

  // Register weave.* commands when targets are supplied. Re-runs only when
  // commandTargets identity changes — useDocument provides stable callbacks
  // via useCallback, so this effectively runs once.
  useEffect(() => {
    if (deps.commandTargets === undefined) return;
    // Indirect via ref so re-registers aren't needed when callbacks change.
    // Phase 4b+ — patch-emitting mutations (updateItem / updateBehavior /
    // updateShape / removeShape) route through `editor.exec` so the bridge
    // (canvas-shape move/resize/rotate) and any plugin caller goes through
    // ChangeStream → History. Direct setters (add/remove/reset) stay on the
    // targetsRef path; addItem is event-sourced via the pending side-channel.
    const proxy: WeaveCommandTargets = {
      addItem: (kind) => targetsRef.current?.addItem(kind),
      removeItem: (id) => targetsRef.current?.removeItem(id),
      updateItem: (id, patch) => {
        editor.exec("weave.item.update", { itemId: id, patch });
      },
      updateBehavior: (id, bid, patch) => {
        editor.exec("weave.behavior.update", { itemId: id, behaviorId: bid, patch });
      },
      updateShape: (id, sid, patch) => {
        editor.exec("weave.shape.update", { itemId: id, shapeId: sid, patch });
      },
      removeShape: (id, sid) => {
        editor.exec("weave.shape.remove", { itemId: id, shapeId: sid });
      },
      reset: () => targetsRef.current?.reset(),
    };
    const offCommands = registerWeaveCommands(editor, proxy, pendingCreationsRef.current);

    // WI-013 Phase 3 (manipulation dispatch swap) — bridge canvas-shape into
    // agocraft.manipulations. The bridge's update/commit callbacks fan out to
    // the same weave-local apply functions used by SelectionLayer, so plugins
    // resolving via `editor.manipulations.resolve("canvas-shape", "move")` see
    // the live capability without a parallel implementation.
    const weaveCanvasShapeCap = createCanvasShapeCapability({
      updateShape: proxy.updateShape,
      removeShape: proxy.removeShape,
    });
    const offBridge = bridgeCanvasShapeIntoAgocraft({
      weaveCanvasShape: weaveCanvasShapeCap,
      agocraftRegistry: editor.manipulations,
    });
    // Phase 4b — subscribe to the editor's changeStream and apply emitted
    // Changes to useDocument's state via `applyChange`. The filter restricts
    // to user-command + system origins (the latter for History.undo() replay);
    // propagation-origin changes from the RelationEngine are skipped.
    const pending = pendingCreationsRef.current;
    const offChangeSink = editor.changeStream.subscribe(
      (change) => {
        const apply = applyChangeRef.current;
        if (apply === undefined) return;
        apply(change, pending);
      },
      { origins: ["user-command", "system"] },
    );

    // Storage sink — attached to the SAME ChangeStream but via a debounced
    // SchedulingPolicy (OS Rule 4: producer policy-free, consumer self-
    // scheduled). Render path above stays immediate; persistence batches
    // here so a 60Hz drag produces at most one save per debounce window.
    const persistDebounceMs = deps.persistDebounceMs ?? 3000;
    const storageSink: ChangeSink = {
      flush() {
        const persist = persistRef.current;
        if (persist === undefined) return;
        persist();
      },
    };
    const offStorageSink = scheduling
      .debounce(persistDebounceMs)
      .attach(editor.changeStream, storageSink, {
        origins: ["user-command", "system"],
      });

    // WI-028 Phase 3a — sync sink. Mirrors every local Patch into the
    // Y.Doc (immediate, not debounced — the provider already batches
    // outbound pushes). Only attached when collaborative sync is on.
    //
    // agocraft's Change union is patch-shaped (one Change == one Patch
    // plus envelope metadata) so the conversion is structural — a
    // single-site invariant (OS Rule 6's permitted exception for
    // "one site that must know all variants", same shape as
    // serializer.invertPatch).
    const sync = syncBundle;
    let offSyncSink: (() => void) | undefined;
    if (sync !== undefined) {
      const changeToPatch = (c: Change): Patch | undefined => {
        switch (c.type) {
          case "item.attrs":
            return {
              type: c.type,
              itemId: c.itemId,
              before: c.before,
              after: c.after,
            };
          case "item.children":
            return {
              type: c.type,
              itemId: c.itemId,
              added: c.added,
              removed: c.removed,
              ...(c.reordered !== undefined ? { reordered: c.reordered } : {}),
            };
          case "item.units":
            return {
              type: c.type,
              itemId: c.itemId,
              added: c.added,
              removed: c.removed,
            };
          case "unit.attrs":
            return {
              type: c.type,
              itemId: c.itemId,
              unitId: c.unitId,
              unitKind: c.unitKind,
              path: c.path,
              before: c.before,
              after: c.after,
            };
          default:
            return undefined;
        }
      };
      offSyncSink = editor.changeStream.subscribe(
        (change) => {
          const patch = changeToPatch(change);
          if (patch !== undefined) applyPatchToYDoc(sync.yDoc, patch);
        },
        { origins: ["user-command", "system"] },
      );
    }

    return () => {
      offSyncSink?.();
      offStorageSink();
      offChangeSink();
      offBridge();
      offCommands();
    };
    // We intentionally depend only on `editor` — `deps.commandTargets` is read
    // through the ref. Adding it to deps would force a re-registration on
    // every useDocument render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return { editor, vm, router, selectionChrome, sync: syncBundle };
}

// ── projector helper ─────────────────────────────────────────────────────
function findItemInDoc(
  doc: AgocraftDocument,
  itemId: string,
): { readonly attrs: Readonly<Record<string, unknown>> } | undefined {
  const walk = (node: { id: string | number; attrs: Readonly<Record<string, unknown>>; children: ReadonlyArray<unknown> }): { attrs: Readonly<Record<string, unknown>> } | undefined => {
    if (String(node.id) === itemId) return { attrs: node.attrs };
    for (const c of node.children as ReadonlyArray<typeof node>) {
      const found = walk(c);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(doc.root as unknown as Parameters<typeof walk>[0]);
}
