// WI-089 — design-selection export / import (file transport).
//
// This module is the FILE end of the very same pipeline the clipboard
// already runs (WI-041). Copy/paste serialise a selection into a
// `weave/items.v1` `ItemsClipboardPayload` and re-issue it through
// `editor.exec("weave.clipboard.paste", ...)`; export/import does the
// identical thing but the transport is a downloaded / uploaded `.json`
// file instead of the in-memory `clipboardStore` + BroadcastChannel.
//
// Because the payload shape is shared, IMPORT reuses 100% of the paste
// command (remapIds, single-transaction `item.create`, single Cmd+Z,
// MAX_PASTE_NODES cap, frame projection) by writing the parsed payload
// into the clipboard store and invoking the existing paste verb — see
// `use-export-import.ts`. This module owns only the two pure halves:
// build the file envelope from a selection, and parse + validate a file
// back into a payload. No DOM, no editor, no I/O — unit-testable.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { type SerializedItem, serializeItemSubtree } from "@agocraft/core";
import { findItemDeep } from "../agocraft-mirror.js";
import {
  countSubtreeNodes,
  type ItemsClipboardPayload,
  MAX_PASTE_NODES,
} from "../clipboard/clipboard-types.js";

/** Magic marker stamped at the top of every export file. Import refuses
 *  any JSON without it, so an arbitrary `.json` dropped on the importer
 *  fails with a clear `not-a-weave-file` instead of a confusing paste of
 *  garbage. */
export const WEAVE_EXPORT_MAGIC = "weave/design-selection" as const;

/** Bump when the FILE envelope shape changes (independent of the inner
 *  payload's `schemaVersion`). A reader on an older release that doesn't
 *  know this version refuses the file (`unsupported-file-version`). */
export const WEAVE_EXPORT_FILE_VERSION = 1 as const;

/** Self-describing on-disk envelope. The inner `payload` is byte-for-byte
 *  the clipboard's `ItemsClipboardPayload`, so import can hand it straight
 *  to the paste command. */
export interface WeaveExportFileV1 {
  readonly _weave: typeof WEAVE_EXPORT_MAGIC;
  readonly fileVersion: typeof WEAVE_EXPORT_FILE_VERSION;
  /** Unix ms the file was written. Informational (telemetry / "exported
   *  on…"); never used for compatibility decisions. */
  readonly exportedAt: number;
  /** Human hint only — the app version that wrote the file. */
  readonly appVersion: string;
  /** Number of top-level subtrees in the selection (== payload.items.length).
   *  Lets an importer show "12 items" before committing the paste. */
  readonly itemCount: number;
  readonly payload: ItemsClipboardPayload;
}

/** Stable, machine-readable failure codes for build + parse. Mirrors the
 *  clipboard command error surface so the host's toast strings can be
 *  shared. */
export type ExportImportErrorCode =
  | "empty-selection"
  | "no-serialisable-items"
  | "subtree-too-large"
  | "not-json"
  | "not-a-weave-file"
  | "unsupported-file-version"
  | "unsupported-payload"
  | "malformed-payload";

export interface ExportImportError {
  readonly code: ExportImportErrorCode;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ExportImportError };

const fail = (
  code: ExportImportErrorCode,
  message: string,
): { ok: false; error: ExportImportError } => ({
  ok: false,
  error: { code, message },
});

export interface BuildExportEnv {
  /** App version stamped into the payload + envelope (telemetry only). */
  readonly appVersion: string;
  /** Per-tab origin id — same constant the clipboard copy command uses. */
  readonly origin: string;
  /** Clock for the payload + envelope timestamps (host I/O kept explicit
   *  so the builder stays pure / testable). */
  readonly now: () => number;
  /** Node cap summed across the selection. Defaults to MAX_PASTE_NODES so
   *  an export can never produce a file the importer's paste would refuse. */
  readonly maxNodes?: number;
}

/**
 * Build the export file for the current selection.
 *
 * Serialises each selected subtree with the shared `serializeItemSubtree`
 * (identical to what `weave.clipboard.copy` writes), enforces the same
 * `MAX_PASTE_NODES` cap, and wraps everything in a `WeaveExportFileV1`.
 * Items that no longer resolve in `doc` are skipped (a selection can hold
 * an id whose item was just deleted); an all-missing selection fails with
 * `no-serialisable-items`.
 *
 * Selection order is preserved so a multi-item paste reconstructs relative
 * positions the way the user laid them out.
 */
export function buildExportFile(
  doc: AgocraftDocument,
  itemIds: ReadonlyArray<string>,
  env: BuildExportEnv,
): Result<WeaveExportFileV1> {
  if (itemIds.length === 0) {
    return fail("empty-selection", "내보낼 항목이 선택되지 않았습니다.");
  }

  const items: SerializedItem[] = [];
  for (const id of itemIds) {
    const item = findItemDeep(doc, id);
    if (item === undefined) continue; // selection drift — skip silently
    items.push(serializeItemSubtree(item));
  }
  const [primary] = items;
  if (primary === undefined) {
    return fail("no-serialisable-items", "선택한 항목을 문서에서 찾을 수 없습니다.");
  }

  const cap = env.maxNodes ?? MAX_PASTE_NODES;
  const totalNodes = items.reduce((n, it) => n + countSubtreeNodes(it), 0);
  if (totalNodes > cap) {
    return fail("subtree-too-large", `선택 영역이 너무 큽니다 (${totalNodes}개 / 최대 ${cap}개).`);
  }

  const ts = env.now();
  const payload: ItemsClipboardPayload = {
    schemaVersion: 1,
    appVersion: env.appVersion,
    origin: env.origin,
    timestamp: ts,
    kind: "weave/items.v1",
    data: {
      item: primary,
      items,
      // Relation cloning is the clipboard's deferred follow-up (DR-019 D3);
      // the file format inherits the same empty-array contract for parity.
      relations: [],
    },
  };

  return {
    ok: true,
    value: {
      _weave: WEAVE_EXPORT_MAGIC,
      fileVersion: WEAVE_EXPORT_FILE_VERSION,
      exportedAt: ts,
      appVersion: env.appVersion,
      itemCount: items.length,
      payload,
    },
  };
}

/** Serialise a built file to the exact bytes that get downloaded. Pretty-
 *  printed (2-space) so a human can diff / inspect an exported design. */
export function serializeExportFile(file: WeaveExportFileV1): string {
  return JSON.stringify(file, null, 2);
}

// ── Import side — parse + structural validation ─────────────────────────
//
// The file came from outside the running tab (another session, another
// machine, a file the user hand-edited), so unlike the same-build copy
// path it is NOT trusted by construction. We validate the envelope and
// the payload shape down to "every item has the SerializedItem fields"
// before handing it to paste. We do NOT validate `kind` against the host
// schema — `deserializeItemSubtree`'s `onUnknown: "preserve"` policy (used
// downstream by paste) handles unknown item kinds losslessly, matching the
// clipboard's cross-version contract.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Shallow-validate one node has the `SerializedItem` shape, then recurse
 *  into children. Returns false on the first malformed node. */
function isSerializedItem(v: unknown): v is SerializedItem {
  if (!isRecord(v)) return false;
  if (typeof v.id !== "string" || typeof v.kind !== "string") return false;
  if (!isRecord(v.attrs)) return false;
  if (!Array.isArray(v.units)) return false;
  if (!Array.isArray(v.children)) return false;
  for (const child of v.children) {
    if (!isSerializedItem(child)) return false;
  }
  return true;
}

/**
 * Parse the downloaded text back into a validated `ItemsClipboardPayload`
 * ready to write into the clipboard store and paste. Layered failures so
 * the host can show a precise toast:
 *   - `not-json`               — `JSON.parse` threw.
 *   - `not-a-weave-file`       — missing / wrong magic marker.
 *   - `unsupported-file-version` — file from a newer build.
 *   - `unsupported-payload`    — inner schemaVersion / kind we don't run.
 *   - `malformed-payload`      — envelope fine, item shapes corrupt.
 */
export function parseExportFile(text: string): Result<ItemsClipboardPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("not-json", "파일을 읽을 수 없습니다 (JSON 형식이 아닙니다).");
  }

  if (!isRecord(parsed) || parsed._weave !== WEAVE_EXPORT_MAGIC) {
    return fail("not-a-weave-file", "weave 디자인 내보내기 파일이 아닙니다.");
  }
  if (parsed.fileVersion !== WEAVE_EXPORT_FILE_VERSION) {
    return fail("unsupported-file-version", "이 파일은 더 새로운 버전의 weave에서 만들어졌습니다.");
  }

  const payload = parsed.payload;
  if (!isRecord(payload)) {
    return fail("malformed-payload", "파일 내용이 손상되었습니다.");
  }
  if (payload.schemaVersion !== 1 || payload.kind !== "weave/items.v1") {
    return fail("unsupported-payload", "지원하지 않는 페이로드입니다.");
  }

  const data = payload.data;
  if (!isRecord(data)) {
    return fail("malformed-payload", "파일 내용이 손상되었습니다.");
  }

  // Normalise to the multi-item field (back-compat: a file written before
  // `items` still carries the single `item`). At least one valid item is
  // required.
  const rawItems = Array.isArray(data.items) && data.items.length > 0 ? data.items : [data.item];
  if (!rawItems.every(isSerializedItem)) {
    return fail("malformed-payload", "내보낸 항목 데이터가 올바르지 않습니다.");
  }
  const items: SerializedItem[] = rawItems;
  const [primary] = items;
  if (primary === undefined) {
    return fail("malformed-payload", "내보낸 항목 데이터가 올바르지 않습니다.");
  }
  const relations = Array.isArray(data.relations)
    ? (data.relations as ItemsClipboardPayload["data"]["relations"])
    : [];

  const clean: ItemsClipboardPayload = {
    schemaVersion: 1,
    appVersion: typeof payload.appVersion === "string" ? payload.appVersion : "unknown",
    origin: typeof payload.origin === "string" ? payload.origin : "imported",
    timestamp: typeof payload.timestamp === "number" ? payload.timestamp : 0,
    kind: "weave/items.v1",
    data: {
      item: primary,
      items,
      relations,
      ...(typeof data.sourceParentId === "string" ? { sourceParentId: data.sourceParentId } : {}),
    },
  };

  return { ok: true, value: clean };
}
