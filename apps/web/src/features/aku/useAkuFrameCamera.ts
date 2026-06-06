// 아쿠 working-camera (WI-126). While the agent streams, keep the TOP-LEVEL root
// slide (frame) that contains the item it is editing fitted to the viewport — so the
// camera always shows the slide being worked on. Aku then roams WITHIN that slide
// (useAkuRoam wander), so this no longer pins everything to centre the way WI-113
// did (that was withdrawn in WI-116 when Aku was also centre-pinned).
//
// Source = the agent's own `user-command` changes; manual user edits never move the
// camera (gated on `streaming`). The fit math lives in the design page (FrameStage),
// so we resolve the edited item to its root frame id and hand it to `onZoomToFrame`
// (cameraFitBox @ 70%). De-duped by root id: editing many items inside one slide
// fits it once; the camera re-fits only when the edited ROOT slide changes.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useEffect, useRef } from "react";
import { findTrailDeep } from "../../document/agocraft-mirror.js";

const FIT_DEBOUNCE_MS = 200;

export function useAkuFrameCamera(opts: {
  readonly editor: Editor;
  readonly streaming: boolean;
  readonly getDocument: () => AgocraftDocument;
  readonly onZoomToFrame?: ((frameId: string) => void) | undefined;
}): void {
  const { editor, streaming, getDocument, onZoomToFrame } = opts;
  const ref = useRef({ getDocument, onZoomToFrame });
  ref.current = { getDocument, onZoomToFrame };

  useEffect(() => {
    if (!streaming) return;
    let lastRootId: string | null = null;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fitRoot = (itemId: string): void => {
      const { getDocument: getDoc, onZoomToFrame: zoom } = ref.current;
      if (zoom === undefined) return;
      const trail = findTrailDeep(getDoc(), itemId);
      const rootId = trail?.[0] !== undefined ? String(trail[0].id) : itemId;
      if (rootId === lastRootId) return; // already fitted on this slide
      lastRootId = rootId;
      zoom(rootId);
    };
    const off = editor.changeStream.subscribe(
      (change: unknown) => {
        const id = (change as { itemId?: unknown }).itemId;
        if (typeof id !== "string") return;
        pending = id;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          if (pending !== null) fitRoot(pending);
        }, FIT_DEBOUNCE_MS);
      },
      { origins: ["user-command"] },
    );
    return () => {
      off?.();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [editor, streaming]);
}
