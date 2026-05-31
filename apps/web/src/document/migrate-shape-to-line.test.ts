// DR-025 / WI-062 Phase 6 — migration: line-as-shape → `line` kind.
import {
  type Document as AgocraftDocument,
  createSchema,
  FILL_UNIT_KIND,
  type Item as AgocraftItem,
  itemId,
  STROKE_UNIT_KIND,
  unitId,
} from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { migrateShapeLinesToLineKind } from "./migrate-shape-to-line.js";

const NOW = "2026-05-31T12:00:00Z";
const FRAME = { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 } as const;

function shape(
  id: string,
  subAttrs: Record<string, unknown>,
  withFill = true,
): AgocraftItem {
  return {
    id: itemId(id),
    kind: "shape",
    attrs: { frame: FRAME, shape: subAttrs.shape, subAttrs },
    units: withFill
      ? [
          {
            id: unitId(`${id}:${FILL_UNIT_KIND}`),
            kind: FILL_UNIT_KIND,
            attrs: { type: "solid", color: "#abcdef" },
            meta: { schemaVersion: 5 },
          },
        ]
      : [],
    children: [],
    meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: 3 },
  } as AgocraftItem;
}

function doc(children: ReadonlyArray<AgocraftItem>): AgocraftDocument {
  return {
    id: "d",
    schema: createSchema(),
    root: {
      id: itemId("root"),
      kind: "weave-doc",
      attrs: { title: "T" },
      units: [],
      children,
      meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: 3 },
    },
    meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: 3, schemaRefs: [] },
  } as AgocraftDocument;
}

const firstChild = (d: AgocraftDocument) => d.root.children[0]!;

describe("migrateShapeLinesToLineKind", () => {
  it("open poly (자유선) → line with points + smooth carried", () => {
    const pts = [
      { x: 0, y: 0.7 },
      { x: 1, y: 0.3 },
    ];
    const out = firstChild(
      migrateShapeLinesToLineKind(doc([shape("s1", { shape: "poly", points: pts, closed: false, smooth: true })])),
    );
    expect(out.kind).toBe("line");
    expect((out.attrs as { points: unknown }).points).toEqual(pts);
    expect((out.attrs as { smooth: unknown }).smooth).toBe(true);
    expect((out.attrs as { subAttrs?: unknown }).subAttrs).toBeUndefined();
    expect(String(out.id)).toBe("s1"); // id preserved
  });

  it("`line` sub-kind (직선) → 2-point line", () => {
    const out = firstChild(migrateShapeLinesToLineKind(doc([shape("s2", { shape: "line" })])));
    expect(out.kind).toBe("line");
    expect((out.attrs as { points: unknown[] }).points).toHaveLength(2);
  });

  it("`arrow` → line carrying heads", () => {
    const out = firstChild(
      migrateShapeLinesToLineKind(
        doc([shape("s3", { shape: "arrow", heads: { start: "none", end: "triangle" }, headSize: 12 })]),
      ),
    );
    expect(out.kind).toBe("line");
    expect((out.attrs as { heads: unknown }).heads).toEqual({ start: "none", end: "triangle" });
  });

  it("solid fill → stroke unit (colour preserved)", () => {
    const out = firstChild(
      migrateShapeLinesToLineKind(doc([shape("s4", { shape: "poly", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false })])),
    );
    const stroke = out.units.find((u) => u.kind === STROKE_UNIT_KIND);
    expect(stroke).toBeDefined();
    expect((stroke?.attrs as { paint: { color: string } }).paint.color).toBe("#abcdef");
    expect(out.units.some((u) => u.kind === FILL_UNIT_KIND)).toBe(false);
  });

  it("closed poly (자유 다각형) stays a shape", () => {
    const out = firstChild(
      migrateShapeLinesToLineKind(doc([shape("s5", { shape: "poly", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }], closed: true })])),
    );
    expect(out.kind).toBe("shape");
  });

  it("rectangle stays a shape", () => {
    const out = firstChild(
      migrateShapeLinesToLineKind(doc([shape("s6", { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } })])),
    );
    expect(out.kind).toBe("shape");
  });

  it("idempotent + identity when nothing converts", () => {
    const d = doc([shape("s7", { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } })]);
    expect(migrateShapeLinesToLineKind(d)).toBe(d);
    const once = migrateShapeLinesToLineKind(
      doc([shape("s8", { shape: "poly", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false })]),
    );
    const twice = migrateShapeLinesToLineKind(once);
    expect(firstChild(twice).kind).toBe("line");
  });
});
