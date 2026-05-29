// Aku design-aware tools (WI-052 → WI-053) — the bridge from agent tool-calls to
// real, undoable canvas edits. Each executor delegates to an existing `weave.*`
// command via `editor.exec`, so Aku's edits flow through the same History
// contract as any user action (Cmd+Z reverts them). Dispatch is a Map lookup
// (Rule 6) — adding a capability is one map entry, never a switch branch.
//
// WI-053 expands the set (position/size, z-order, duplicate, reparent, layout,
// reorder, select) and the snapshot (per-item frame/fill/layout/childIds +
// selection) so the real model can reason about and manipulate the canvas.

import type { Document as AgocraftDocument, LayoutSpec } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import type { DomainKind, Item as WeaveItem } from "../../../document/types.js";
import type { AkuDocItemSnapshot, AkuDocSnapshot } from "../transport/types.js";
import type { AkuToolExecutor, AkuToolResult, AkuToolset } from "./types.js";

interface ExecResult {
  readonly ok: boolean;
  readonly code?: string;
}

const ADDABLE: ReadonlySet<string> = new Set(["frame", "image", "video", "shape", "text"]);

/** Frame fields the model may set on a single item (0..1 ratios of the parent). */
const FRAME_FIELDS = ["x", "y", "width", "height", "rotation"] as const;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function createAkuTools(deps: {
  readonly editor: Editor;
  readonly getDocument: () => AgocraftDocument;
  readonly getSelection: () => ReadonlyArray<string>;
  readonly selectItems: (ids: ReadonlyArray<string>) => void;
}): AkuToolset {
  const { editor, getDocument, getSelection, selectItems } = deps;

  const run = (name: string, input: unknown): ExecResult =>
    editor.exec(name, input) as unknown as ExecResult;
  const result = (r: ExecResult, ok: string): AkuToolResult =>
    r.ok ? { ok: true, summary: ok } : { ok: false, summary: `실패: ${r.code ?? "unknown"}` };

  /** Build an attrs patcher that merges `text` and any provided frame fields. */
  const itemPatcher =
    (input: Record<string, unknown>) =>
    (it: WeaveItem): WeaveItem => {
      const attrs = { ...(it.attrs as unknown as Record<string, unknown>) };
      const text = asString(input.text);
      if (text !== undefined) attrs.text = text;
      const prevFrame = attrs.frame as Record<string, unknown> | undefined;
      if (prevFrame !== undefined) {
        const nextFrame = { ...prevFrame };
        let touched = false;
        for (const f of FRAME_FIELDS) {
          const n = asNumber(input[f]);
          if (n !== undefined) {
            nextFrame[f] = n;
            touched = true;
          }
        }
        if (touched) attrs.frame = nextFrame;
      }
      return { ...it, attrs: attrs as unknown as WeaveItem["attrs"] };
    };

  const requireId = (input: unknown): string | null => {
    const id = (input as { itemId?: unknown }).itemId;
    return typeof id === "string" ? id : null;
  };

  /** z-order tools share the same one-id → command shape. */
  const zOrder =
    (command: string, label: string): AkuToolExecutor =>
    (input) => {
      const itemId = requireId(input);
      if (itemId === null) return { ok: false, summary: "itemId 누락" };
      return result(run(command, { itemId }), label);
    };

  const executors = new Map<string, AkuToolExecutor>([
    [
      "addItem",
      (input) => {
        const i = input as { kind?: string; containerId?: string; frame?: unknown; text?: string };
        const kind = i.kind;
        if (kind === undefined || !ADDABLE.has(kind)) {
          return { ok: false, summary: `알 수 없는 종류: ${String(kind)}` };
        }
        const text = asString(i.text);
        return result(
          run("weave.item.add", {
            kind: kind as DomainKind,
            ...(typeof i.containerId === "string" ? { containerId: i.containerId } : {}),
            ...(i.frame !== undefined ? { frame: i.frame } : {}),
            ...(text !== undefined ? { attrsOverride: { text } } : {}),
          }),
          `${kind} 추가됨`,
        );
      },
    ],
    [
      "updateItem",
      (input) => {
        const itemId = requireId(input);
        if (itemId === null) return { ok: false, summary: "itemId 누락" };
        return result(
          run("weave.item.update", {
            itemId,
            patch: itemPatcher(input as Record<string, unknown>),
          }),
          "아이템 수정됨",
        );
      },
    ],
    [
      // Back-compat alias kept so older scripts / the mock keep working.
      "updateItemText",
      (input) => {
        const { itemId, text } = input as { itemId?: string; text?: string };
        if (typeof itemId !== "string" || typeof text !== "string") {
          return { ok: false, summary: "itemId/text 누락" };
        }
        return result(
          run("weave.item.update", { itemId, patch: itemPatcher({ text }) }),
          "텍스트 수정됨",
        );
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
        const itemId = requireId(input);
        if (itemId === null) return { ok: false, summary: "itemId 누락" };
        return result(run("weave.item.remove", { itemId }), "아이템 삭제됨");
      },
    ],
    [
      "duplicateItem",
      (input) => {
        const itemId = requireId(input);
        if (itemId === null) return { ok: false, summary: "itemId 누락" };
        return result(run("weave.item.duplicate", { itemId }), "아이템 복제됨");
      },
    ],
    [
      "reparentItem",
      (input) => {
        const { itemId, newParentId } = input as { itemId?: string; newParentId?: string };
        if (typeof itemId !== "string" || typeof newParentId !== "string") {
          return { ok: false, summary: "itemId/newParentId 누락" };
        }
        return result(run("weave.item.reparent", { itemId, newParentId }), "부모 변경됨");
      },
    ],
    ["bringToFront", zOrder("weave.item.bringToFront", "맨 앞으로")],
    ["sendToBack", zOrder("weave.item.sendToBack", "맨 뒤로")],
    ["bringForward", zOrder("weave.item.bringForward", "앞으로")],
    ["sendBackward", zOrder("weave.item.sendBackward", "뒤로")],
    [
      "setFrameLayout",
      (input) => {
        const { itemId, layout } = input as { itemId?: string; layout?: unknown };
        if (typeof itemId !== "string") return { ok: false, summary: "itemId 누락" };
        const spec = layout === null || layout === undefined ? undefined : (layout as LayoutSpec);
        return result(
          run("weave.frame.setLayout", { itemId, layout: spec }),
          spec === undefined ? "레이아웃 해제됨" : "레이아웃 적용됨",
        );
      },
    ],
    [
      "reorderChildren",
      (input) => {
        const i = input as { containerId?: string; order?: unknown };
        if (!Array.isArray(i.order) || !i.order.every((x) => typeof x === "string")) {
          return { ok: false, summary: "order(string[]) 누락" };
        }
        return result(
          run("weave.design.reorderChildren", {
            ...(typeof i.containerId === "string" ? { containerId: i.containerId } : {}),
            order: i.order,
          }),
          "순서 변경됨",
        );
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
    [
      // Selection is view state, not a document mutation — it does NOT go through
      // editor.exec / History (so it adds no undo entry).
      "selectItems",
      (input) => {
        const ids = (input as { itemIds?: unknown }).itemIds;
        if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
          return { ok: false, summary: "itemIds(string[]) 누락" };
        }
        selectItems(ids);
        return { ok: true, summary: `${ids.length}개 선택됨` };
      },
    ],
  ]);

  const snapshotItem = (c: {
    readonly id: unknown;
    readonly kind: string;
    readonly attrs: unknown;
    readonly children?: ReadonlyArray<{ readonly id: unknown }>;
  }): AkuDocItemSnapshot => {
    const a = c.attrs as Record<string, unknown>;
    const text = asString(a.text);
    const f = a.frame as Record<string, unknown> | undefined;
    const frame =
      f !== undefined
        ? {
            x: asNumber(f.x) ?? 0,
            y: asNumber(f.y) ?? 0,
            w: asNumber(f.width) ?? 0,
            h: asNumber(f.height) ?? 0,
          }
        : undefined;
    const fill = asString(a.background) ?? asString(a.hue) ?? asString(a.color);
    const layoutKind = asString((a.layout as { kind?: unknown } | undefined)?.kind);
    const children = c.children;
    const childIds =
      children !== undefined && children.length > 0
        ? children.map((ch) => String(ch.id))
        : undefined;
    return {
      id: String(c.id),
      kind: c.kind,
      ...(text !== undefined ? { text } : {}),
      ...(frame !== undefined ? { frame } : {}),
      ...(fill !== undefined ? { fill } : {}),
      ...(layoutKind !== undefined ? { layout: layoutKind } : {}),
      ...(childIds !== undefined ? { childIds } : {}),
    };
  };

  const snapshot = (): AkuDocSnapshot => {
    const doc = getDocument();
    // `weave.design.setBackground` writes document.attrs.background (not root).
    const bg = ((doc as { attrs?: { background?: string | null } }).attrs?.background ?? null) as
      | string
      | null;
    return {
      background: bg,
      items: doc.root.children.map((c) => snapshotItem(c)),
      selectedIds: [...getSelection()],
    };
  };

  const history = {
    depth: (): number => editor.history.undoSize(),
    undo: (times: number): void => {
      for (let i = 0; i < times && editor.history.canUndo(); i++) {
        editor.history.undo();
      }
    },
  };

  return { executors, snapshot, history };
}
