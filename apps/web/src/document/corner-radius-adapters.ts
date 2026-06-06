// Per-kind corner-radius read/write strategies (WI-109, Rule 6 — one adapter
// per kind, no `switch` in the handle's drag loop).
//
// Two storage shapes live behind one interface:
//   • frame / image / video — a UNIFORM scalar (`cornerRadius` / `borderRadius`)
//     plus an additive optional PER-CORNER four-tuple (`cornerRadii` /
//     `borderRadii`). The renderer uses the tuple when present, else the scalar.
//     Writing uniform clears the tuple; entering split seeds the tuple from the
//     scalar; per-corner writes update one key of the tuple.
//   • shape (rectangle) — only `subAttrs.cornerRadii` (no scalar). Writes go
//     through the `weave.shape.setCornerRadius` command (uniform `radius` or a
//     per-corner `radii` partial).
//
// Every write goes through a command so it lands in History; the 60 Hz drag
// folds into one undo step via the command's mergeKey.

import type { Editor } from "@agocraft/editor";
import { type CornerKey, type CornerRadii, uniformRadii } from "./corner-radius.js";

type Attrs = Readonly<Record<string, unknown>>;

export interface CornerRadiusAdapter {
  /** Current four-tuple in design-px (uniform scalar → all equal). */
  read(attrs: Attrs): CornerRadii;
  /** Drag one corner to `r` (design-px) while in split mode. */
  writeCorner(editor: Editor, itemId: string, corner: CornerKey, r: number): void;
  /** Set every corner to `r` (design-px) — uniform drag AND the merge on
   *  double-click. Clears any per-corner data so the renderer takes the scalar
   *  fast-path again. */
  writeUniform(editor: Editor, itemId: string, r: number): void;
  /** Ensure per-corner data exists (seed from the current uniform value) so a
   *  freshly-split item keeps its look until a corner is dragged. */
  enterSplit(editor: Editor, itemId: string): void;
}

function toRadii(v: unknown): CornerRadii | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Partial<Record<CornerKey, unknown>>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0);
  return { tl: n(o.tl), tr: n(o.tr), br: n(o.br), bl: n(o.bl) };
}

/** frame / image / video: scalar `scalarKey` + optional four-tuple `tupleKey`. */
function mediaAdapter(scalarKey: string, tupleKey: string): CornerRadiusAdapter {
  const readTuple = (attrs: Attrs): CornerRadii => {
    const tuple = toRadii(attrs[tupleKey]);
    if (tuple !== null) return tuple;
    const scalar = attrs[scalarKey];
    return uniformRadii(typeof scalar === "number" ? scalar : 0);
  };
  return {
    read: readTuple,
    writeCorner(editor, itemId, corner, r) {
      editor.exec("weave.item.update", {
        itemId,
        patch: (prev: { attrs: Attrs }) => ({
          attrs: {
            ...prev.attrs,
            [tupleKey]: { ...readTuple(prev.attrs), [corner]: Math.max(0, r) },
          },
        }),
      });
    },
    writeUniform(editor, itemId, r) {
      editor.exec("weave.item.update", {
        itemId,
        patch: (prev: { attrs: Attrs }) => {
          // Drop the per-corner tuple so the scalar fast-path renders again.
          const { [tupleKey]: _drop, ...rest } = prev.attrs;
          return { attrs: { ...rest, [scalarKey]: Math.max(0, r) } };
        },
      });
    },
    enterSplit(editor, itemId) {
      editor.exec("weave.item.update", {
        itemId,
        patch: (prev: { attrs: Attrs }) => ({
          attrs: { ...prev.attrs, [tupleKey]: readTuple(prev.attrs) },
        }),
      });
    },
  };
}

/** shape rectangle: per-corner `subAttrs.cornerRadii`, written via the command. */
const shapeAdapter: CornerRadiusAdapter = {
  read(attrs) {
    const sub = attrs.subAttrs as { cornerRadii?: unknown } | undefined;
    return toRadii(sub?.cornerRadii) ?? uniformRadii(0);
  },
  writeCorner(editor, itemId, corner, r) {
    editor.exec("weave.shape.setCornerRadius", { itemId, radii: { [corner]: Math.max(0, r) } });
  },
  writeUniform(editor, itemId, r) {
    editor.exec("weave.shape.setCornerRadius", { itemId, radius: Math.max(0, r) });
  },
  enterSplit() {
    // Shapes always carry the four-tuple — nothing to seed.
  },
};

const ADAPTERS: Readonly<Record<string, CornerRadiusAdapter>> = {
  frame: mediaAdapter("cornerRadius", "cornerRadii"),
  image: mediaAdapter("borderRadius", "borderRadii"),
  video: mediaAdapter("borderRadius", "borderRadii"),
  shape: shapeAdapter,
};

/** Resolve the corner-radius adapter for an item kind, or `null` when the kind
 *  has no corner-radius surface (text / line / chart / qr …). */
export function cornerRadiusAdapter(kind: string): CornerRadiusAdapter | null {
  return ADAPTERS[kind] ?? null;
}
