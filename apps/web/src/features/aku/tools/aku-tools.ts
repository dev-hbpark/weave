// Aku design-aware tools (WI-052) — the bridge from agent tool-calls to real,
// undoable canvas edits. Each executor delegates to an existing `weave.*`
// command via `editor.exec`, so Aku's edits flow through the same History
// contract as any user action (Cmd+Z reverts them). Dispatch is a Map lookup
// (Rule 6) — adding a capability is one map entry, never a switch branch.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import type { DomainKind, Item as WeaveItem } from "../../../document/types.js";
import type { AkuDocSnapshot } from "../transport/types.js";
import type { AkuToolExecutor, AkuToolResult, AkuToolset } from "./types.js";

interface ExecResult {
  readonly ok: boolean;
  readonly code?: string;
}

const ADDABLE: ReadonlySet<string> = new Set(["frame", "image", "video", "shape", "text"]);

export function createAkuTools(deps: {
  readonly editor: Editor;
  readonly getDocument: () => AgocraftDocument;
  readonly getSelection: () => ReadonlyArray<string>;
}): AkuToolset {
  const { editor, getDocument, getSelection } = deps;

  const run = (name: string, input: unknown): ExecResult =>
    editor.exec(name, input) as unknown as ExecResult;
  const result = (r: ExecResult, ok: string): AkuToolResult =>
    r.ok ? { ok: true, summary: ok } : { ok: false, summary: `실패: ${r.code ?? "unknown"}` };

  const executors = new Map<string, AkuToolExecutor>([
    [
      "addItem",
      (input) => {
        const kind = (input as { kind?: string }).kind;
        if (kind === undefined || !ADDABLE.has(kind)) {
          return { ok: false, summary: `알 수 없는 종류: ${String(kind)}` };
        }
        return result(run("weave.item.add", { kind: kind as DomainKind }), `${kind} 추가됨`);
      },
    ],
    [
      "setBackground",
      (input) => {
        const color = (input as { color?: string | null }).color ?? null;
        return result(run("weave.design.setBackground", { color }), `배경색 ${color ?? "지움"}`);
      },
    ],
    [
      "removeItem",
      (input) => {
        const itemId = (input as { itemId?: string }).itemId;
        if (typeof itemId !== "string") return { ok: false, summary: "itemId 누락" };
        return result(run("weave.item.remove", { itemId }), "아이템 삭제됨");
      },
    ],
    [
      "updateItemText",
      (input) => {
        const { itemId, text } = input as { itemId?: string; text?: string };
        if (typeof itemId !== "string" || typeof text !== "string") {
          return { ok: false, summary: "itemId/text 누락" };
        }
        const patch = (it: WeaveItem): WeaveItem => ({
          ...it,
          attrs: { ...it.attrs, text } as WeaveItem["attrs"],
        });
        return result(run("weave.item.update", { itemId, patch }), "텍스트 수정됨");
      },
    ],
    [
      "insertSlidePreset",
      (input) => {
        const presetId = (input as { presetId?: string }).presetId ?? "cover.bold";
        return result(
          run("weave.preset.insertSlide", { presetId }),
          `슬라이드(${presetId}) 추가됨`,
        );
      },
    ],
  ]);

  const snapshot = (): AkuDocSnapshot => {
    const doc = getDocument();
    // `weave.design.setBackground` writes document.attrs.background (not root).
    const bg = ((doc as { attrs?: { background?: string | null } }).attrs?.background ?? null) as
      | string
      | null;
    return {
      background: bg,
      items: doc.root.children.map((c) => {
        const text = (c.attrs as { text?: unknown }).text;
        return {
          id: String(c.id),
          kind: c.kind,
          ...(typeof text === "string" ? { text } : {}),
        };
      }),
      selectedIds: [...getSelection()],
    };
  };

  return { executors, snapshot };
}
