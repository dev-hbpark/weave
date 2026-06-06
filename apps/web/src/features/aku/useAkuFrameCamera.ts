// 아쿠 working-camera (WI-115). While the agent streams, keep the ROOT frame
// (top-level slide) it is editing centred in the viewport — so the user watches
// the work happen front-and-centre under the centred Aku. The trigger is the
// agent's own `user-command` changes; manual user edits never move the camera
// (gated on `streaming`), so this can't fight a person who is editing.
//
// We only know the agent's run-state here; the actual camera fit lives in the
// design page (FrameStage owns the fit math). So this hook resolves the edited
// item to its top-level frame id and hands that off to `onZoomToFrame` (the same
// fit DesignPage uses for thumbnail double-click — cameraFitBox at FRAME_FIT_FILL).
// De-duped by root id so a burst of edits on one slide doesn't re-fit every frame.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useEffect, useRef } from "react";
import { findTrailDeep } from "../../document/agocraft-mirror.js";

const CENTRE_DEBOUNCE_MS = 220;

export function useAkuFrameCamera(opts: {
  readonly editor: Editor;
  readonly streaming: boolean;
  readonly getDocument: () => AgocraftDocument;
  readonly onZoomToFrame?: ((frameId: string) => void) | undefined;
}): void {
  const { editor, streaming, getDocument, onZoomToFrame } = opts;
  // Latest getters/callbacks, read inside the long-lived subscription.
  const ref = useRef({ getDocument, onZoomToFrame });
  ref.current = { getDocument, onZoomToFrame };

  useEffect(() => {
    if (!streaming) return;
    let lastRootId: string | null = null;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const centre = (itemId: string): void => {
      const { getDocument: getDoc, onZoomToFrame: zoom } = ref.current;
      if (zoom === undefined) return;
      const trail = findTrailDeep(getDoc(), itemId);
      const rootId = trail?.[0] !== undefined ? String(trail[0].id) : itemId;
      if (rootId === lastRootId) return; // already centred on this slide
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
          if (pending !== null) centre(pending);
        }, CENTRE_DEBOUNCE_MS);
      },
      { origins: ["user-command"] },
    );
    return () => {
      off?.();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [editor, streaming]);
}
