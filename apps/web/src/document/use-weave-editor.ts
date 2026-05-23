// WI-013 Phase 1 — single `@agocraft/editor` instance per route, backed by the
// weave Document mirror. `getDocument` reads from a ref so the editor always
// sees the latest mirror without recreating the editor on every doc change.

import {
  type Change,
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
} from "@agocraft/core";
import { createEditor, type Editor } from "@agocraft/editor";
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
}

/** Build an Editor wired to the weave doc mirror. The Editor itself is stable
 *  (same instance across renders); only its `getDocument` resolves to the
 *  latest mirror via a ref. Slots and DocumentType registration happen once. */
export function useWeaveEditor(deps: UseWeaveEditorDeps): Editor {
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
      // History merge window — coalesce same-target patches arriving within
      // 500ms into one undo step. Critical for drag gestures: a 60Hz canvas
      // drag emits ~60 patches/sec; without merging, Cmd+Z would step back
      // one frame at a time. Text editing also benefits — a burst of
      // keystrokes on the same EditableText commits as one undo.
      historyMergeWindowMs: 500,
    });
    // Baseline slots so the idle-router has something to read. Plugins / DocumentType
    // contributions override later via registerSlot.
    e.registerSlot("hitTest", () => "selectable");
    e.registerSlot("dragMove", () => {});
    e.registerSlot("dragCommit", () => {});
    e.documentTypes.register({
      kind: "weave-doc",
      displayName: "Weave Document",
      allowedChildKinds: ["slide", "canvas-design", "block-doc", "media"],
      ux: {},
    });
    e.useDocumentType("weave-doc");
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // construct once; the ref carries doc changes.
  }, []);

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

    return () => {
      offChangeSink();
      offBridge();
      offCommands();
    };
    // We intentionally depend only on `editor` — `deps.commandTargets` is read
    // through the ref. Adding it to deps would force a re-registration on
    // every useDocument render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return editor;
}
