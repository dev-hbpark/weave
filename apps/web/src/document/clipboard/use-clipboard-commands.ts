// WI-041 Phase 2/3 — host-side wiring for the four clipboard
// `editor-hotkeys` commands.
//
// Responsibilities:
//
//   1. Translate the hotkey / ContextMenu dispatch into the matching
//      `editor.exec("weave.clipboard.*", input)` call, resolving live
//      selection / pointer state at call time.
//   2. Subscribe to `clipboardStore` so `commandContext.clipboardHasItems`
//      can drive the paste button's disabled state without DesignPage
//      having to poll.
//
// The hook registers a single dispatcher with `setClipboardDispatcher`;
// the four EDITOR_COMMANDS entries each fire one verb through it.

import type { Editor } from "@agocraft/editor";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { setClipboardDispatcher, setClipboardHasItemsProbe } from "../tooltip/editor-hotkeys.js";
import { mountBroadcastChannelTransport } from "./broadcast-channel-transport.js";
import { clipboardStore } from "./clipboard-store.js";
import { type PasteMode, SESSION_ORIGIN } from "./clipboard-types.js";
import { mountLocalStorageTransport } from "./local-storage-transport.js";
import { writeOsClipboardMarker } from "./os-clipboard-marker.js";
import { type OfficePasteHint, officePasteHint } from "./paste-coord.js";

export interface UseClipboardCommandsDeps {
  readonly editor: Editor;
  /** Currently selected primary item id, or `undefined` when nothing is
   *  selected. v1 only supports single-item copy/cut; multi-selection
   *  graduates with WI-036. */
  readonly selectedId: string | undefined;
  /** Resolve the destination container id at paste time. Returning
   *  `undefined` means the document root. */
  readonly resolveContainerId: () => string | undefined;
  /** Pixel size of the destination container (FrameStage knows the
   *  rendered box for the active frame). Returning `null` aborts the
   *  paste — the resolver needs a non-zero container to project frames
   *  into the parent's ratio space. */
  readonly resolveContainerSizePx: () => { width: number; height: number } | null;
  /** Last known pointer position relative to the container. `undefined`
   *  → keyboard-driven paste path (D5 offset fallback). */
  readonly resolvePointerInContainer: () => { x: number; y: number } | undefined;
  /** WI-185 ⑫ (spec D-5) — paste coordinate contract from the editor
   *  mode's InsertionPolicy. `"source-position"` (page-bounded flavors)
   *  replaces the pointer channel with the office-contract hint: cross-page
   *  paste preserves the source frame exactly, same-page paste keeps the
   *  8px stack. Absent / `"cursor"` → the existing pointer behaviour. */
  readonly resolvePasteCoordMode?: () => "cursor" | "source-position";
  /** Resolve the source container for `cut` — i.e., the parent of
   *  `selectedId`. v1 only supports cutting a top-level child; pass
   *  the container id explicitly so the underlying patch targets the
   *  right parent. */
  readonly resolveSourceContainerId: () => string | undefined;
  /** All currently-selected target Item ids. v1 single-selection passes
   *  a one-element array. Used by Paste Special modes (style / text /
   *  size / position) to mutate every recipient at once. */
  readonly resolveTargetIds: () => ReadonlyArray<string>;
  /** Non-fatal feedback channel — surfaced to the user as a toast / log
   *  by the host. Optional. */
  readonly onInfo?: (message: string) => void;
  /** Called with the ids of the newly pasted root items so the host can
   *  select them (Figma parity: a paste lands selected). A multi-select
   *  paste passes every new id. Only fires for the "everything" paste that
   *  creates items — the style/text/size/position-only Paste Special modes
   *  mutate existing targets and don't change the selection. Optional. */
  readonly onPasted?: (ids: ReadonlyArray<string>) => void;
}

export interface UseClipboardCommandsResult {
  /** True iff the clipboard store currently holds a payload that we
   *  understand. Drives the paste button's enabled state and the
   *  `ctx.clipboardHasItems` slot. */
  readonly hasItems: boolean;
  /** Paste Special dialog open state. */
  readonly pasteSpecialOpen: boolean;
  /** Setter for the dialog open state (the dialog's controlled API). */
  readonly setPasteSpecialOpen: (next: boolean) => void;
  /** Fired when the user picks a mode and confirms — host invokes
   *  `weave.clipboard.paste` with the chosen mode and the current
   *  selection. */
  readonly handlePasteSpecialConfirm: (mode: PasteMode) => void;
}

/** Subscribe to `clipboardStore` and expose a `hasItems` boolean that
 *  React re-renders on each write/clear. Uses `useSyncExternalStore` so
 *  the snapshot is consistent across concurrent rendering. */
function useClipboardHasItems(): boolean {
  return useSyncExternalStore(
    clipboardStore.subscribe,
    () => clipboardStore.peek() !== undefined,
    // SSR snapshot — no clipboard on the server.
    () => false,
  );
}

/** WI-185 ⑫ — resolve what travels down the kit's opaque pointer channel
 *  for an "everything" paste: the office-contract hint in source-position
 *  mode (pointer ignored), the live pointer otherwise. */
function resolvePasteHostHint(
  resolvePasteCoordMode: UseClipboardCommandsDeps["resolvePasteCoordMode"],
  resolvePointerInContainer: UseClipboardCommandsDeps["resolvePointerInContainer"],
  containerId: string | undefined,
): OfficePasteHint | { x: number; y: number } | undefined {
  if (resolvePasteCoordMode?.() === "source-position") {
    const sourceParentId = clipboardStore.peek()?.data.sourceParentId;
    return officePasteHint(sourceParentId !== undefined && sourceParentId === containerId);
  }
  return resolvePointerInContainer();
}

export function useClipboardCommands(deps: UseClipboardCommandsDeps): UseClipboardCommandsResult {
  const hasItems = useClipboardHasItems();
  const [pasteSpecialOpen, setPasteSpecialOpen] = useState(false);

  // Phase 4 — cross-tab transports. Both are mounted concurrently so a
  // tab opened in a BroadcastChannel-less environment still reaches its
  // peers via the storage-event bus. Each transport guards self-receive
  // and re-broadcast via the SESSION_ORIGIN constant.
  //
  // StrictMode safety: each effect mount creates a fresh pair of
  // transports and the cleanup tears them down — there is no module-
  // level singleton to leak (`feedback_react_strictmode_singleton_dispose`
  // is the failure mode we are deliberately avoiding).
  useEffect(() => {
    const broadcast = mountBroadcastChannelTransport(SESSION_ORIGIN);
    const localStorage = mountLocalStorageTransport(SESSION_ORIGIN);
    // WI-185 ⑰ — the plain-paste binding probes the store at keydown time:
    // EMPTY → it skips preventDefault so the native `paste` event fires and
    // the OS-clipboard image listener can take over.
    const probeDispose = setClipboardHasItemsProbe(() => clipboardStore.peek() !== undefined);
    return () => {
      broadcast.dispose();
      localStorage.dispose();
      probeDispose();
    };
  }, []);

  useEffect(() => {
    const dispose = setClipboardDispatcher((verb) => {
      const editor = deps.editor;

      if (verb === "copy") {
        // Copy every selected item (multi-select), in selection order.
        const itemIds = deps.resolveTargetIds();
        if (itemIds.length === 0) return;
        const result = editor.exec("weave.clipboard.copy", { itemIds });
        // WI-186 — stamp the OS clipboard so paste-time routing can tell
        // the weave copy is the NEWEST copy (recency oracle, DR-122).
        if (result.ok) writeOsClipboardMarker();
        return;
      }
      if (verb === "cut") {
        const itemIds = deps.resolveTargetIds();
        if (itemIds.length === 0) return;
        const containerId = deps.resolveSourceContainerId();
        const result = editor.exec("weave.clipboard.cut", {
          itemIds,
          ...(containerId !== undefined ? { containerId } : {}),
        });
        if (result.ok) writeOsClipboardMarker();
        return;
      }
      if (verb === "paste") {
        const containerSize = deps.resolveContainerSizePx();
        if (containerSize === null) return;
        const containerId = deps.resolveContainerId();
        const hint = resolvePasteHostHint(
          deps.resolvePasteCoordMode,
          deps.resolvePointerInContainer,
          containerId,
        );
        const result = editor.exec<unknown, ReadonlyArray<string>>("weave.clipboard.paste", {
          containerSizePx: containerSize,
          ...(containerId !== undefined ? { containerId } : {}),
          ...(hint !== undefined ? { pointerInContainer: hint } : {}),
        });
        if (result.ok) deps.onPasted?.(result.value);
        return;
      }
      if (verb === "pasteSpecial") {
        // Phase 6 — open the dialog. The user picks a mode and the
        // host invokes `weave.clipboard.paste` with that mode through
        // `handlePasteSpecialConfirm`. We do not gate on
        // `hasItems` here: the dialog itself shows the empty-clipboard
        // state if the user opens it without a copy first.
        setPasteSpecialOpen(true);
        return;
      }
    });
    return dispose;
  }, [
    deps.editor,
    deps.resolveTargetIds,
    deps.resolveContainerId,
    deps.resolveContainerSizePx,
    deps.resolvePointerInContainer,
    deps.resolvePasteCoordMode,
    deps.resolveSourceContainerId,
    deps.onPasted,
  ]);

  const handlePasteSpecialConfirm = useCallback(
    (mode: PasteMode) => {
      setPasteSpecialOpen(false);
      if (mode === "everything") {
        // Same path as plain Cmd+V — the dialog just acts as a UI nudge.
        const containerSize = deps.resolveContainerSizePx();
        if (containerSize === null) return;
        const containerId = deps.resolveContainerId();
        const hint = resolvePasteHostHint(
          deps.resolvePasteCoordMode,
          deps.resolvePointerInContainer,
          containerId,
        );
        const result = deps.editor.exec<unknown, ReadonlyArray<string>>("weave.clipboard.paste", {
          containerSizePx: containerSize,
          ...(containerId !== undefined ? { containerId } : {}),
          ...(hint !== undefined ? { pointerInContainer: hint } : {}),
        });
        if (result.ok) deps.onPasted?.(result.value);
        return;
      }
      // The four "only" modes need targets. The command refuses with
      // `no-targets` if the user has no selection — surface a toast
      // via onInfo so the failure is visible (the dialog already
      // shows a warning before the user submits, but this is the
      // final guard).
      const targetIds = deps.resolveTargetIds();
      if (targetIds.length === 0) {
        deps.onInfo?.("Paste Special needs a target selection.");
        return;
      }
      const containerSize = deps.resolveContainerSizePx();
      if (containerSize === null) return;
      deps.editor.exec("weave.clipboard.paste", {
        mode,
        targetIds,
        containerSizePx: containerSize,
      });
    },
    [deps],
  );

  return { hasItems, pasteSpecialOpen, setPasteSpecialOpen, handlePasteSpecialConfirm };
}
