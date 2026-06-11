import { useEffect, useRef } from "react";
import { clipboardStore } from "../../../document/clipboard/clipboard-store.js";
import { clipboardEventHasOsMarker } from "../../../document/clipboard/os-clipboard-marker.js";
import { isCroppingNow } from "../../../document/interactions/cropping-state.js";
import { fileToDataUrl, ingestImageDataUrl } from "../../../document/resource-storage.js";
import { dispatchClipboardVerb } from "../../../document/tooltip/editor-hotkeys.js";

// WI-185 ⑰ + WI-186 — native `paste` event router for the canvas.
//
// How this composes with the keydown binding (priority contract, DR-122):
//
//   - Marker routing ACTIVE (a weave copy successfully stamped the OS
//     clipboard — `os-clipboard-marker.ts`): the editor-hotkeys Cmd+V
//     binding always yields (no preventDefault), the browser fires the
//     native `paste` event, and the router below decides by RECENCY:
//       ① weave marker present → the internal copy is the newest → internal
//          paste dispatch.
//       ② image file, no marker → something was copied AFTER the weave copy
//          → the OS image wins (Figma/office parity) and is ingested.
//       ③ neither, internal store non-empty → internal paste (the marker was
//          overwritten by an external TEXT copy — weave has no text ingest,
//          so internal-first matches the pre-WI-186 behavior).
//   - Marker routing INACTIVE (write failed / never attempted): the keydown
//     binding keeps the legacy WI-185 probe routing — non-empty store pastes
//     internal at keydown (this listener never fires), empty store falls
//     through to ② here.
//
// Text-editing surfaces (inputs / textareas / contenteditable) keep their
// native paste untouched — same bail as the editor hotkeys themselves. The
// cropping bail mirrors the keydown action's `isCroppingNow()` guard for the
// internal-dispatch branches.

/** Mirror of MediaSrcDialog's MAX_IMAGE_BYTES — data-URL upper bound. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export interface UseOsPasteRoutingParams {
  /** Insert an image item with the given src (canonical cloud URL or data:
   *  fallback). DesignPage passes `addNewItem("image", undefined, src)` so
   *  container resolution / geometry / selection match the "+" add menu. */
  readonly addImage: (src: string) => void;
  /** Non-fatal feedback channel (oversize file, upload fallback). Optional. */
  readonly onInfo?: (message: string) => void;
}

function isTextEditingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.matches('input, textarea, [contenteditable="true"]') || t.isContentEditable)
  );
}

export function useOsPasteRouting({ addImage, onInfo }: UseOsPasteRoutingParams): void {
  // Ref-mirror the callbacks so the window listener registers exactly once
  // and still reads the live closures at paste time.
  const addImageRef = useRef(addImage);
  addImageRef.current = addImage;
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Text surfaces keep their native paste behavior.
      if (isTextEditingTarget(e.target)) return;

      // ① WI-186 — weave marker → the newest copy is the internal one.
      if (clipboardEventHasOsMarker(e)) {
        if (isCroppingNow()) return;
        e.preventDefault();
        dispatchClipboardVerb("paste");
        return;
      }

      // ② WI-185 ⑰ — OS-clipboard image (no marker → copied after any weave
      //    copy) → ingest as a new image item.
      const files = e.clipboardData?.files;
      const file =
        files === undefined
          ? undefined
          : Array.from(files).find((f) => f.type.startsWith("image/"));
      if (file !== undefined) {
        e.preventDefault();
        if (file.size > MAX_IMAGE_BYTES) {
          onInfoRef.current?.("이미지가 너무 커요 (최대 6 MB).");
          return;
        }
        void (async () => {
          try {
            const dataUrl = await fileToDataUrl(file);
            const name = file.name !== "" ? file.name : "pasted-image.png";
            const r = await ingestImageDataUrl(dataUrl, name);
            if (!r.uploaded) {
              onInfoRef.current?.(
                "서버 업로드에 실패했어요. 로컬에 보관했다가 연결되면 자동으로 업로드할게요.",
              );
            }
            addImageRef.current(r.src);
          } catch {
            onInfoRef.current?.("클립보드 이미지를 읽지 못했어요.");
          }
        })();
        return;
      }

      // ③ WI-186 fallback — no marker, no image, but internal items exist
      //    (external text copy overwrote the marker). Internal-first matches
      //    the pre-WI-186 behavior; weave has no OS-text ingest.
      if (clipboardStore.peek() !== undefined) {
        if (isCroppingNow()) return;
        e.preventDefault();
        dispatchClipboardVerb("paste");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
}
