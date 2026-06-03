// WI-089 — host wiring for design-selection export / import.
//
// EXPORT  : build the file from the current selection (pure, in
//           `export-import.ts`) → trigger a browser download of the JSON.
// IMPORT  : read the file text → parse + validate → write the payload into
//           the SAME `clipboardStore` the paste command reads from → invoke
//           `editor.exec("weave.clipboard.paste", ...)`. This reuses the
//           entire paste machinery (remapIds, single Cmd+Z, frame
//           projection, MAX_PASTE_NODES cap). The user's real clipboard is
//           saved and restored around the import so importing a file does
//           not silently clobber what they had copied.
//
// The paste-side resolvers (container id / size / pointer) are passed in by
// the host so import lands items exactly where a Cmd+V would.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { useCallback } from "react";
import { clipboardStore } from "../clipboard/clipboard-store.js";
import { SESSION_ORIGIN } from "../clipboard/clipboard-types.js";
import {
  buildExportFile,
  type ExportImportError,
  parseExportFile,
  serializeExportFile,
} from "./export-import.js";

/** App version stamped into exported files. Matches the clipboard
 *  command's `APP_VERSION` constant (informational only). */
const APP_VERSION = "weave.dev";

export interface UseExportImportDeps {
  readonly editor: Editor;
  /** Live document, read at export time to serialise the selection. */
  readonly getDocument: () => AgocraftDocument;
  /** Item ids to export — the current selection, in selection order. */
  readonly resolveExportItemIds: () => ReadonlyArray<string>;
  /** Used for the download filename: `<slug>-selection.json`. */
  readonly designTitle: string;
  /** Paste target container (root → undefined). Same resolver as Cmd+V. */
  readonly resolveContainerId: () => string | undefined;
  /** Container px size; `null` aborts the import-paste (matches clipboard). */
  readonly resolveContainerSizePx: () => { readonly width: number; readonly height: number } | null;
  /** Last pointer position in the container, or undefined for the offset
   *  fallback path. */
  readonly resolvePointerInContainer: () => { readonly x: number; readonly y: number } | undefined;
  /** Fired with the newly-pasted root ids so the host can select them. */
  readonly onPasted?: (ids: ReadonlyArray<string>) => void;
  /** Non-fatal user feedback (toast / log). */
  readonly onInfo?: (message: string) => void;
}

export interface UseExportImportResult {
  /** Serialise the current selection and download it as a `.json` file. */
  readonly exportSelection: () => void;
  /** Read + validate a picked file and paste its items into the doc as a
   *  single undoable transaction. */
  readonly importFile: (file: File) => Promise<void>;
}

/** `My Design 2` → `my-design-2`. Falls back to `design` when empty. */
function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "design";
}

/** Download `text` as `filename` via an object URL + synthetic anchor.
 *  Guarded for SSR / non-DOM environments (the hook can mount before the
 *  document plane is live). */
function downloadJson(filename: string, text: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the click has consumed the URL first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useExportImport(deps: UseExportImportDeps): UseExportImportResult {
  const exportSelection = useCallback(() => {
    const itemIds = deps.resolveExportItemIds();
    const built = buildExportFile(deps.getDocument(), itemIds, {
      appVersion: APP_VERSION,
      origin: SESSION_ORIGIN,
      now: () => Date.now(),
    });
    if (!built.ok) {
      deps.onInfo?.(built.error.message);
      return;
    }
    const filename = `${slugify(deps.designTitle)}-selection.json`;
    downloadJson(filename, serializeExportFile(built.value));
    deps.onInfo?.(`${built.value.itemCount}개 항목을 내보냈습니다.`);
  }, [deps]);

  const importFile = useCallback(
    async (file: File) => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        deps.onInfo?.("파일을 읽지 못했습니다.");
        return;
      }

      const parsed = parseExportFile(text);
      if (!parsed.ok) {
        deps.onInfo?.((parsed.error as ExportImportError).message);
        return;
      }

      const containerSize = deps.resolveContainerSizePx();
      if (containerSize === null) {
        deps.onInfo?.("붙여넣을 위치를 찾지 못했습니다.");
        return;
      }

      // Reuse the paste command end-to-end: stash the live clipboard, write
      // the imported payload, paste, then restore — so import never eats the
      // user's copy. paste is synchronous (editor.exec returns a Result), so
      // the swap window is a single tick.
      const previous = clipboardStore.peek();
      clipboardStore.write(parsed.value);

      const containerId = deps.resolveContainerId();
      const pointer = deps.resolvePointerInContainer();
      const result = deps.editor.exec<unknown, ReadonlyArray<string>>("weave.clipboard.paste", {
        containerSizePx: containerSize,
        ...(containerId !== undefined ? { containerId } : {}),
        ...(pointer !== undefined ? { pointerInContainer: pointer } : {}),
      });

      if (previous !== undefined) clipboardStore.write(previous);
      else clipboardStore.clear();

      if (result.ok) {
        deps.onPasted?.(result.value);
        deps.onInfo?.(`${result.value.length}개 항목을 가져왔습니다.`);
      } else {
        deps.onInfo?.("가져오기에 실패했습니다.");
      }
    },
    [deps],
  );

  return { exportSelection, importFile };
}
