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
import { setClipboardDispatcher } from "../tooltip/editor-hotkeys.js";
import { mountBroadcastChannelTransport } from "./broadcast-channel-transport.js";
import { clipboardStore } from "./clipboard-store.js";
import { type PasteMode, SESSION_ORIGIN } from "./clipboard-types.js";
import { mountLocalStorageTransport } from "./local-storage-transport.js";

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
    return () => {
      broadcast.dispose();
      localStorage.dispose();
    };
  }, []);

  useEffect(() => {
    const dispose = setClipboardDispatcher((verb) => {
      const editor = deps.editor;
      const id = deps.selectedId;

      if (verb === "copy") {
        if (id === undefined) return;
        editor.exec("weave.clipboard.copy", { itemIds: [id] });
        return;
      }
      if (verb === "cut") {
        if (id === undefined) return;
        const containerId = deps.resolveSourceContainerId();
        editor.exec("weave.clipboard.cut", {
          itemIds: [id],
          ...(containerId !== undefined ? { containerId } : {}),
        });
        return;
      }
      if (verb === "paste") {
        const containerSize = deps.resolveContainerSizePx();
        if (containerSize === null) return;
        const containerId = deps.resolveContainerId();
        const pointer = deps.resolvePointerInContainer();
        editor.exec("weave.clipboard.paste", {
          containerSizePx: containerSize,
          ...(containerId !== undefined ? { containerId } : {}),
          ...(pointer !== undefined ? { pointerInContainer: pointer } : {}),
        });
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
    deps.selectedId,
    deps.resolveContainerId,
    deps.resolveContainerSizePx,
    deps.resolvePointerInContainer,
    deps.resolveSourceContainerId,
    deps.onInfo,
  ]);

  const handlePasteSpecialConfirm = useCallback(
    (mode: PasteMode) => {
      setPasteSpecialOpen(false);
      if (mode === "everything") {
        // Same path as plain Cmd+V — the dialog just acts as a UI nudge.
        const containerSize = deps.resolveContainerSizePx();
        if (containerSize === null) return;
        const containerId = deps.resolveContainerId();
        const pointer = deps.resolvePointerInContainer();
        deps.editor.exec("weave.clipboard.paste", {
          containerSizePx: containerSize,
          ...(containerId !== undefined ? { containerId } : {}),
          ...(pointer !== undefined ? { pointerInContainer: pointer } : {}),
        });
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
