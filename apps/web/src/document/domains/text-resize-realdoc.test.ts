import type { Document as AgocraftDocument, Item, LayoutSpec } from "@agocraft/core";
import { createAutoFlexSpec, itemId } from "@agocraft/core";
import { contentAutoAxesFor } from "@agocraft/layout";
import { describe, expect, it } from "vitest";
import { findParentAndIndex } from "../agocraft-mirror.js";
import { contentAutoAxesToMode, layoutChildForTextResizeMode } from "./derive-text-auto-resize.js";

const META = { createdAt: "t", updatedAt: "t", schemaVersion: 11 };
const F = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
});
function mk(id: string, kind: string, attrs: Record<string, unknown>, children: Item[] = []): Item {
  return { id: itemId(id), kind, attrs, units: [], children, meta: { ...META } } as Item;
}

// The EXACT structure from untitled-design-selection (3).json: a deeply-nested
// doc — root → page → flex(column, align:start) → [frame, frame, text(fixed)].
function realDoc(): AgocraftDocument {
  const flex: LayoutSpec = createAutoFlexSpec({ direction: "column", align: "start" });
  const text = mk("text-mqcbbi9l-8", "text", {
    frame: F(0, 0.4, 0.6501, 0.6),
    layoutChild: { kind: "auto-flex", grow: 0, shrink: 0, basis: 0.6, crossSize: 0.6501 },
    fontSizeSpec: { kind: "ratio", value: 0.214 },
  });
  const f4 = mk("frame-mqcb8jtq-4", "frame", {
    frame: F(0, 0, 0.231, 0.2),
    layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.69, crossSize: 0.23 },
  });
  const container = mk(
    "frame-mqcb86r4-2",
    "frame",
    { frame: F(2.1, -0.25, 0.6, 0.47), layout: flex },
    [f4, text],
  );
  // nest the flex container a couple of levels deep (page → root) like the app.
  const page = mk("page-1", "frame", { frame: F(0, 0, 1, 1) }, [container]);
  const root = mk("root", "frame", { frame: F(0, 0, 1, 1) }, [page]);
  return { root, relations: [], meta: { ...META } } as unknown as AgocraftDocument;
}

describe("real-doc (nested) toolbar read path: findParentAndIndex + contentAutoAxesFor", () => {
  const TEXT = "text-mqcbbi9l-8";

  it("findParentAndIndex resolves the flex-column parent for the deeply-nested text", () => {
    const doc = realDoc();
    const found = findParentAndIndex(doc, TEXT);
    expect(found).toBeDefined();
    const layout = (found?.parent.attrs as { layout?: LayoutSpec }).layout;
    expect(layout?.kind).toBe("auto-flex");
    expect((layout as { direction?: string })?.direction).toBe("column");
  });

  it("write 자동너비 then read (findParentAndIndex + contentAutoAxesFor) → 자동너비", () => {
    const doc = realDoc();
    const parentLayout = (findParentAndIndex(doc, TEXT)?.parent.attrs as { layout?: LayoutSpec })
      .layout;
    const cur = { kind: "auto-flex", grow: 0, shrink: 0, basis: 0.6, crossSize: 0.6501 } as const;
    const written = layoutChildForTextResizeMode("WIDTH_AND_HEIGHT", cur, parentLayout, {
      width: 0.6501,
      height: 0.6,
    });
    const axes = contentAutoAxesFor(parentLayout, written);
    expect(axes.managed).toBe(true);
    expect(contentAutoAxesToMode(axes)).toBe("WIDTH_AND_HEIGHT");
  });
});
