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
import { useEffect, useSyncExternalStore } from "react";
import { setClipboardDispatcher } from "../tooltip/editor-hotkeys.js";
import { mountBroadcastChannelTransport } from "./broadcast-channel-transport.js";
import { clipboardStore } from "./clipboard-store.js";
import { SESSION_ORIGIN } from "./clipboard-types.js";
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
  /** Non-fatal feedback channel — currently used by the Paste Special
   *  stub. Optional. */
  readonly onInfo?: (message: string) => void;
}

export interface UseClipboardCommandsResult {
  /** True iff the clipboard store currently holds a payload that we
   *  understand. Drives the paste button's enabled state and the
   *  `ctx.clipboardHasItems` slot. */
  readonly hasItems: boolean;
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
        // Phase 6 lands the real dialog. v1 surfaces a discoverable
        // "coming soon" message so users don't think the hotkey is
        // broken.
        deps.onInfo?.("Paste Special is coming in a follow-up release.");
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

  return { hasItems };
}
