import type {
  Document as AgocraftDocument,
  Item,
  LayoutChildPolicy,
  LayoutSpec,
} from "@agocraft/core";
import { createAutoFlexSpec, itemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { getLayoutEngine } from "../layout/registry.js";
import {
  contentAutoAxesToMode,
  type LegacyTextAutoResize,
  layoutChildForTextResizeMode,
} from "./derive-text-auto-resize.js";

const META = { createdAt: "t", updatedAt: "t", schemaVersion: 11 };
const F = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h, rotation: 0 });
function mk(id: string, attrs: Record<string, unknown>, children: Item[] = []): Item {
  return { id: itemId(id), kind: "text", attrs, units: [], children, meta: { ...META } } as Item;
}

/** Build root → flex container → one text child with the given policy/frame. */
function doc(parent: LayoutSpec, childPolicy: LayoutChildPolicy | undefined): AgocraftDocument {
  const child = mk("c", {
    frame: F(0.5, 0.4),
    ...(childPolicy ? { layoutChild: childPolicy } : {}),
  });
  const container = mk("p", { frame: F(1, 1), layout: parent }, [child]);
  const root = mk("root", { frame: F(1, 1) }, [container]);
  return { root, relations: [], meta: { ...META } } as unknown as AgocraftDocument;
}

const MODES: LegacyTextAutoResize[] = ["WIDTH_AND_HEIGHT", "HEIGHT", "NONE"];

describe("text resize mode round-trips through the engine (write → getContentAutoAxes → read)", () => {
  for (const dir of ["row", "column"] as const) {
    for (const align of ["start", "stretch"] as const) {
      const parent = createAutoFlexSpec({ direction: dir, align });
      for (const mode of MODES) {
        it(`flex-${dir} align:${align}: ${mode} survives write→read`, () => {
          const start: LayoutChildPolicy = {
            kind: "auto-flex",
            grow: 0,
            shrink: 1,
            basis: "auto",
            // a currently-FILL child (the case that mislabeled): stretch cross.
            ...(align === "stretch" ? { alignSelf: "stretch" as const } : {}),
          };
          const written = layoutChildForTextResizeMode(mode, start, parent, {
            width: 0.5,
            height: 0.4,
          });
          const d = doc(parent, written);
          const axes = getLayoutEngine().getContentAutoAxes({ root: d.root, itemId: itemId("c") });
          expect(contentAutoAxesToMode(axes), `${dir}/${align}/${mode}`).toBe(mode);
        });
      }
    }
  }

  // Original start-from-content-auto matrix (kept).
  for (const dir of ["row", "column"] as const) {
    const parent = createAutoFlexSpec({ direction: dir, align: "start" });
    for (const mode of MODES) {
      it(`flex-${dir}: ${mode} survives a write→read round-trip`, () => {
        // Start from a content-auto child (basis "auto", no crossSize) as a fresh
        // flex member would be.
        const start: LayoutChildPolicy = { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" };
        const written = layoutChildForTextResizeMode(mode, start, parent, {
          width: 0.5,
          height: 0.4,
        });
        const d = doc(parent, written);
        const axes = getLayoutEngine().getContentAutoAxes({ root: d.root, itemId: itemId("c") });
        expect(axes.managed).toBe(true);
        expect(contentAutoAxesToMode(axes)).toBe(mode);
      });
    }
  }
});
