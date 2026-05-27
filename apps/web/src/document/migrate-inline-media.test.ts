import { describe, expect, it } from "vitest";
import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import {
  findInlineImageItems,
  replaceInlineImageSrcs,
  synthesiseResourceName,
} from "./migrate-inline-media.js";

function imageItem(id: string, src: string, children: AgocraftItem[] = []): AgocraftItem {
  return {
    id: id as unknown as AgocraftItem["id"],
    kind: "image",
    attrs: { src },
    units: [],
    children,
    meta: {
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
      schemaVersion: 5,
    },
  } as unknown as AgocraftItem;
}

function frameItem(id: string, children: AgocraftItem[]): AgocraftItem {
  return {
    id: id as unknown as AgocraftItem["id"],
    kind: "frame",
    attrs: {},
    units: [],
    children,
    meta: {
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
      schemaVersion: 5,
    },
  } as unknown as AgocraftItem;
}

function docWith(children: AgocraftItem[]): AgocraftDocument {
  return {
    id: "test-doc",
    root: {
      id: "test-doc-root" as unknown as AgocraftItem["id"],
      kind: "weave-doc",
      attrs: {},
      units: [],
      children,
      meta: {
        createdAt: "2026-05-27T00:00:00Z",
        updatedAt: "2026-05-27T00:00:00Z",
        schemaVersion: 5,
      },
    },
    meta: {
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
      schemaVersion: 5,
    },
  } as unknown as AgocraftDocument;
}

describe("findInlineImageItems", () => {
  it("returns empty when no images present", () => {
    const doc = docWith([frameItem("f", [])]);
    expect(findInlineImageItems(doc)).toEqual([]);
  });

  it("skips images whose src is already a cloud URL", () => {
    const doc = docWith([imageItem("img1", "https://cloud.example.com/a.png")]);
    expect(findInlineImageItems(doc)).toEqual([]);
  });

  it("skips video / blob URLs and HTTP URLs", () => {
    const doc = docWith([
      imageItem("img1", "blob:http://localhost/abc"),
      imageItem("img2", "http://example.com/x.jpg"),
    ]);
    expect(findInlineImageItems(doc)).toEqual([]);
  });

  it("returns every image whose src is a data URL, depth-first", () => {
    const doc = docWith([
      imageItem("a", "data:image/png;base64,AAA"),
      frameItem("f", [imageItem("b", "data:image/jpeg;base64,BBB")]),
      imageItem("c", "data:image/svg+xml;base64,CCC"),
    ]);
    const targets = findInlineImageItems(doc);
    expect(targets.map((t) => t.itemId)).toEqual(["a", "b", "c"]);
    expect(targets.map((t) => t.mime)).toEqual(["image/png", "image/jpeg", "image/svg+xml"]);
  });

  it("falls back to image/png when the data URL header is missing", () => {
    const doc = docWith([imageItem("a", "data:,AAA")]);
    const targets = findInlineImageItems(doc);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.mime).toBe("image/png");
  });
});

describe("synthesiseResourceName", () => {
  it("builds a filename from id + extension", () => {
    expect(synthesiseResourceName("img-1", "image/png")).toBe("migrated-img-1.png");
    expect(synthesiseResourceName("img-2", "image/jpeg")).toBe("migrated-img-2.jpeg");
  });

  it("collapses multipart MIMEs to the base extension", () => {
    expect(synthesiseResourceName("img-3", "image/svg+xml")).toBe("migrated-img-3.svg");
  });

  it("defaults to .png on a degenerate MIME", () => {
    expect(synthesiseResourceName("img-4", "weird")).toBe("migrated-img-4.png");
  });
});

describe("replaceInlineImageSrcs", () => {
  it("returns input unchanged when the map is empty", () => {
    const blob = { id: "x", kind: "image", attrs: { src: "data:..." } };
    expect(replaceInlineImageSrcs(blob, new Map())).toBe(blob);
  });

  it("substitutes src only on matching image items", () => {
    const blob = {
      id: "root",
      kind: "weave-doc",
      attrs: {},
      children: [
        { id: "a", kind: "image", attrs: { src: "data:image/png;base64,AAA", alt: "" } },
        { id: "b", kind: "frame", attrs: { src: "data:not-an-image" } },
        {
          id: "c",
          kind: "frame",
          attrs: {},
          children: [{ id: "d", kind: "image", attrs: { src: "data:image/jpeg;base64,DDD" } }],
        },
      ],
    };
    const map = new Map([
      ["a", "https://cloud.example.com/a.png"],
      ["d", "https://cloud.example.com/d.jpg"],
    ]);
    const out = replaceInlineImageSrcs(blob, map) as Record<string, unknown>;
    const children = out.children as ReadonlyArray<Record<string, unknown>>;
    expect((children[0]!.attrs as { src: string }).src).toBe(
      "https://cloud.example.com/a.png",
    );
    expect((children[0]!.attrs as { alt: string }).alt).toBe("");
    // Frame item with a coincidentally-named src field is left alone.
    expect((children[1]!.attrs as { src: string }).src).toBe("data:not-an-image");
    const grand = (children[2]!.children as ReadonlyArray<Record<string, unknown>>)[0]!;
    expect((grand.attrs as { src: string }).src).toBe("https://cloud.example.com/d.jpg");
  });

  it("does not mutate the input tree", () => {
    const blob = {
      id: "a",
      kind: "image",
      attrs: { src: "data:image/png;base64,AAA" },
    };
    const original = JSON.parse(JSON.stringify(blob));
    replaceInlineImageSrcs(blob, new Map([["a", "https://cloud/x.png"]]));
    expect(blob).toEqual(original);
  });

  it("ignores items whose id is not in the map", () => {
    const blob = {
      id: "z",
      kind: "image",
      attrs: { src: "data:image/png;base64,ZZZ" },
    };
    const out = replaceInlineImageSrcs(blob, new Map([["a", "https://cloud/x.png"]])) as Record<
      string,
      unknown
    >;
    expect((out.attrs as { src: string }).src).toBe("data:image/png;base64,ZZZ");
  });
});
