// WI-032 Phase 2 — unit tests for the legacy 4-domain → `frame` migration.
//
// Covers the four conversions (slide / canvas-design / block-doc / media),
// asserts idempotency on `frame`-only docs, preserves Item ids, and walks
// nested children. Visual round-trip is asserted by a separate playwright
// `frame-only-migration.spec.ts` (Phase 6).

import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  createSchema,
  itemId,
} from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { migrateLegacyKindsToFrame } from "./migrate-frame-only.js";

const NOW = "2026-05-25T12:00:00Z";
const FULL_FRAME = { x: 0, y: 0, width: 1, height: 1, rotation: 0 } as const;
const SLIDE_FRAME = { x: 0.2, y: 0.2, width: 0.6, height: 0.6, rotation: 0 } as const;

function makeItem(
  id: string,
  kind: string,
  attrs: Readonly<Record<string, unknown>>,
  children: ReadonlyArray<AgocraftItem> = [],
): AgocraftItem {
  return {
    id: itemId(id),
    kind,
    attrs,
    units: [],
    children,
    meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: 3 },
  };
}

function makeDoc(children: ReadonlyArray<AgocraftItem>): AgocraftDocument {
  return {
    id: "test-design",
    schema: createSchema(),
    root: makeItem("test-design-root", "weave-doc", { title: "Test" }, children),
    meta: {
      createdAt: NOW,
      updatedAt: NOW,
      schemaVersion: 3,
      schemaRefs: [],
    },
  };
}

describe("migrateLegacyKindsToFrame — slide → frame", () => {
  it("converts title + bullets into text children", () => {
    const slide = makeItem("slide-A", "slide", {
      frame: SLIDE_FRAME,
      title: "Hello",
      bullets: ["a", "b"],
    });
    const doc = makeDoc([slide]);
    const migrated = migrateLegacyKindsToFrame(doc);
    expect(migrated).not.toBe(doc); // changed → new identity
    const root = migrated.root;
    expect(root.children).toHaveLength(1);
    const frame = root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.kind).toBe("frame");
    expect(String(frame.id)).toBe("slide-A"); // id preserved
    expect((frame.attrs as { frame: unknown }).frame).toEqual(SLIDE_FRAME);
    // children: title + 2 bullets
    expect(frame.children).toHaveLength(3);
    const kinds = frame.children.map((c) => c.kind);
    expect(kinds).toEqual(["text", "text", "text"]);
    const texts = frame.children.map((c) => (c.attrs as { text: string }).text);
    expect(texts).toEqual(["Hello", "• a", "• b"]);
    // title is bold (fontSize 32), bullets normal (fontSize 18)
    const titleAttrs = frame.children[0]?.attrs as {
      fontSize: number;
      fontWeight: string;
    };
    expect(titleAttrs.fontSize).toBe(32);
    expect(titleAttrs.fontWeight).toBe("bold");
  });

  it("omits the title text Item when the legacy slide had no title", () => {
    const slide = makeItem("slide-B", "slide", {
      frame: SLIDE_FRAME,
      title: "",
      bullets: ["only-bullet"],
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([slide]));
    const frame = migrated.root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.children).toHaveLength(1);
    expect((frame.children[0]?.attrs as { text: string }).text).toBe("• only-bullet");
  });
});

describe("migrateLegacyKindsToFrame — canvas-design → frame", () => {
  it("converts shapes[] into shape primitive children", () => {
    const canvas = makeItem("canvas-A", "canvas-design", {
      frame: SLIDE_FRAME,
      summary: "Quick notes",
      shapes: [
        { id: "s1", x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0, hue: "var(--accent)" },
        { id: "s2", x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0, hue: "#ff0000" },
      ],
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([canvas]));
    const frame = migrated.root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.kind).toBe("frame");
    // 2 shapes + 1 summary text
    expect(frame.children).toHaveLength(3);
    const kinds = frame.children.map((c) => c.kind);
    expect(kinds).toEqual(["shape", "shape", "text"]);
    const firstShape = frame.children[0];
    if (firstShape === undefined) throw new Error("missing shape");
    const shapeAttrs = firstShape.attrs as {
      shape: string;
      fill: { type: string; color: string };
      frame: { x: number; y: number };
    };
    expect(shapeAttrs.shape).toBe("rectangle");
    expect(shapeAttrs.fill.type).toBe("solid");
    expect(shapeAttrs.fill.color).toBe("var(--accent)");
    expect(shapeAttrs.frame.x).toBe(0.1);
  });

  it("omits summary text when summary is empty", () => {
    const canvas = makeItem("canvas-B", "canvas-design", {
      frame: SLIDE_FRAME,
      summary: "",
      shapes: [
        { id: "s1", x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0, hue: "#000" },
      ],
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([canvas]));
    const frame = migrated.root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.children).toHaveLength(1);
    expect(frame.children[0]?.kind).toBe("shape");
  });
});

describe("migrateLegacyKindsToFrame — block-doc → frame", () => {
  it("converts heading + paragraphs into two text children", () => {
    const doc = makeItem("doc-A", "block-doc", {
      frame: SLIDE_FRAME,
      heading: "Title",
      paragraphs: ["First.", "Second."],
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([doc]));
    const frame = migrated.root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.kind).toBe("frame");
    expect(frame.children).toHaveLength(2);
    const texts = frame.children.map((c) => (c.attrs as { text: string }).text);
    expect(texts).toEqual(["Title", "First.\nSecond."]);
  });
});

describe("migrateLegacyKindsToFrame — media → frame", () => {
  it("converts tone='image' into an image primitive + caption text", () => {
    const media = makeItem("media-A", "media", {
      frame: SLIDE_FRAME,
      caption: "A photo of weave",
      tone: "image",
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([media]));
    const frame = migrated.root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.children).toHaveLength(2);
    expect(frame.children[0]?.kind).toBe("image");
    expect((frame.children[1]?.attrs as { text: string }).text).toBe("A photo of weave");
  });

  it("converts tone='video' into a video primitive", () => {
    const media = makeItem("media-B", "media", {
      frame: SLIDE_FRAME,
      caption: "",
      tone: "video",
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([media]));
    const frame = migrated.root.children[0];
    if (frame === undefined) throw new Error("missing frame");
    expect(frame.children).toHaveLength(1);
    expect(frame.children[0]?.kind).toBe("video");
  });
});

describe("migrateLegacyKindsToFrame — semantics", () => {
  it("is idempotent on a frame-only document (returns the same reference)", () => {
    const frame = makeItem("frame-A", "frame", { frame: FULL_FRAME });
    const doc = makeDoc([frame]);
    const migrated = migrateLegacyKindsToFrame(doc);
    expect(migrated).toBe(doc);
  });

  it("preserves the original Item id when rewriting kind", () => {
    const slide = makeItem("slide-keep-id", "slide", {
      frame: SLIDE_FRAME,
      title: "T",
      bullets: [],
    });
    const migrated = migrateLegacyKindsToFrame(makeDoc([slide]));
    expect(String(migrated.root.children[0]?.id)).toBe("slide-keep-id");
  });

  it("recurses into nested children (frame inside legacy slide)", () => {
    const nested = makeItem("nested-frame", "frame", { frame: SLIDE_FRAME });
    const slide = makeItem(
      "outer-slide",
      "slide",
      { frame: SLIDE_FRAME, title: "Outer", bullets: [] },
      [nested],
    );
    const migrated = migrateLegacyKindsToFrame(makeDoc([slide]));
    const outer = migrated.root.children[0];
    if (outer === undefined) throw new Error("missing outer frame");
    expect(outer.kind).toBe("frame");
    // Title child + the preserved nested frame.
    expect(outer.children).toHaveLength(2);
    expect(outer.children[1]?.kind).toBe("frame");
    expect(String(outer.children[1]?.id)).toBe("nested-frame");
  });

  it("walks deeply nested legacy kinds (slide inside a frame inside the root)", () => {
    const innerSlide = makeItem("inner-slide", "slide", {
      frame: SLIDE_FRAME,
      title: "Deep",
      bullets: [],
    });
    const wrapperFrame = makeItem(
      "wrapper-frame",
      "frame",
      { frame: FULL_FRAME },
      [innerSlide],
    );
    const migrated = migrateLegacyKindsToFrame(makeDoc([wrapperFrame]));
    const wrapper = migrated.root.children[0];
    if (wrapper === undefined) throw new Error("missing wrapper");
    expect(wrapper.kind).toBe("frame");
    const innerAfter = wrapper.children[0];
    if (innerAfter === undefined) throw new Error("missing inner");
    expect(innerAfter.kind).toBe("frame"); // slide rewritten
    expect((innerAfter.children[0]?.attrs as { text: string }).text).toBe("Deep");
  });
});
