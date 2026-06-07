// WI-139 — embed metadata persistence transforms (title + Vimeo/Loom poster).

import type { Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { collectEmbedUrlsNeedingMeta, setEmbedMeta } from "./embed-meta-sync.js";

const YT = "https://youtu.be/dQw4w9WgXcQ";
const VIMEO = "https://vimeo.com/76979871";

const embed = (id: string, attrs: Record<string, unknown>) => ({
  id,
  kind: "embed",
  attrs,
  children: [],
});

function makeDoc(...items: ReturnType<typeof embed>[]): AgocraftDocument {
  return {
    root: { id: "root", kind: "frame", attrs: {}, children: items },
  } as unknown as AgocraftDocument;
}

describe("collectEmbedUrlsNeedingMeta", () => {
  it("needs a fetch when the title is missing (any provider)", () => {
    expect([...collectEmbedUrlsNeedingMeta(makeDoc(embed("a", { url: YT })))]).toEqual([YT]);
  });

  it("a fully-titled YouTube needs nothing (poster is derived)", () => {
    expect(collectEmbedUrlsNeedingMeta(makeDoc(embed("a", { url: YT, title: "t" }))).size).toBe(0);
  });

  it("a titled Vimeo still needs a fetch until its poster is persisted", () => {
    expect([
      ...collectEmbedUrlsNeedingMeta(makeDoc(embed("a", { url: VIMEO, title: "t" }))),
    ]).toEqual([VIMEO]);
    expect(
      collectEmbedUrlsNeedingMeta(makeDoc(embed("a", { url: VIMEO, title: "t", posterUrl: "p" })))
        .size,
    ).toBe(0);
  });

  it("ignores empty / unrecognized urls", () => {
    expect(
      collectEmbedUrlsNeedingMeta(
        makeDoc(embed("a", { url: "" }), embed("b", { url: "https://example.com" })),
      ).size,
    ).toBe(0);
  });
});

describe("setEmbedMeta", () => {
  it("fills only the MISSING fields, never overwriting", () => {
    const doc = makeDoc(embed("a", { url: VIMEO, title: "Hand-set" }));
    const next = setEmbedMeta(doc, VIMEO, { title: "Fetched", posterUrl: "https://p.jpg" });
    expect(next.root.children[0]?.attrs).toEqual({
      url: VIMEO,
      title: "Hand-set", // kept
      posterUrl: "https://p.jpg", // filled
    });
  });

  it("applies to every embed with that url", () => {
    const doc = makeDoc(
      embed("a", { url: YT }),
      embed("b", { url: YT }),
      embed("c", { url: VIMEO }),
    );
    const next = setEmbedMeta(doc, YT, { title: "X" });
    expect(next.root.children.map((c) => (c.attrs as { title?: string }).title)).toEqual([
      "X",
      "X",
      undefined,
    ]);
  });

  it("returns the SAME doc ref when nothing changes (convergence)", () => {
    const doc = makeDoc(embed("a", { url: YT, title: "t" }));
    expect(setEmbedMeta(doc, YT, { title: "other" })).toBe(doc);
    expect(setEmbedMeta(doc, "https://other", { title: "x" })).toBe(doc);
  });
});
