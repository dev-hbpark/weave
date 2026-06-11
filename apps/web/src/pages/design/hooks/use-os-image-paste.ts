import { useEffect, useRef } from "react";
import { fileToDataUrl, ingestImageDataUrl } from "../../../document/resource-storage.js";

// WI-185 ⑰ — OS-clipboard image paste (Figma/office parity): Cmd+V with a
// screenshot / copied image in the system clipboard drops it onto the canvas
// as a new image item.
//
// How this composes with the internal clipboard (priority contract):
//
//   1. The editor-hotkeys Cmd+V binding probes `clipboardHasItemsProbe` at
//      keydown time. Internal items present → it preventDefaults and pastes
//      them (existing behavior, internal clipboard WINS).
//   2. Internal store EMPTY → the binding returns without preventDefault, so
//      the browser fires the native `paste` event and the listener below
//      handles an OS-clipboard image.
//
// Known residual (recorded in WI-185): once the user copies a weave item,
// the internal store shadows OS-clipboard images for the rest of the
// session — we cannot tell which copy is NEWER without writing a weave
// marker into the OS clipboard on copy (the real fix, deferred).
//
// Text-editing surfaces (inputs / textareas / contenteditable) keep their
// native paste untouched — same bail as the editor hotkeys themselves.

/** Mirror of MediaSrcDialog's MAX_IMAGE_BYTES — data-URL upper bound. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export interface UseOsImagePasteParams {
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

export function useOsImagePaste({ addImage, onInfo }: UseOsImagePasteParams): void {
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
      const files = e.clipboardData?.files;
      if (files === undefined || files.length === 0) return;
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (file === undefined) return;
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
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
}
