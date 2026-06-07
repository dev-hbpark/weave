// WI-139 — embed title persistence transforms.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { collectTitlelessEmbedUrls, setEmbedTitle } from "./embed-title-sync.js";

const YT = "https://youtu.be/dQw4w9WgXcQ";

const embed = (id: string, url: string, title?: string) => ({
  id,
  kind: "embed",
  attrs: title === undefined ? { url } : { url, title },
  children: [],
});

function makeDoc(...items: ReturnType<typeof embed>[]): AgocraftDocument {
  return {
    root: { id: "root", kind: "frame", attrs: {}, children: items },
  } as unknown as AgocraftDocument;
}

describe("collectTitlelessEmbedUrls", () => {
  it("collects recognized embed urls that lack a title", () => {
    const doc = makeDoc(
      embed("a", YT),
      embed("b", YT, "Already titled"),
      embed("c", "https://vimeo.com/76979871"),
      embed("d", "https://example.com/not-an-embed"),
      embed("e", ""),
    );
    expect([...collectTitlelessEmbedUrls(doc)].sort()).toEqual(
      [YT, "https://vimeo.com/76979871"].sort(),
    );
  });

  it("dedupes the same url used by multiple embeds", () => {
    expect(collectTitlelessEmbedUrls(makeDoc(embed("a", YT), embed("b", YT))).size).toBe(1);
  });
});

describe("setEmbedTitle", () => {
  it("sets the title on every titleless embed with that url", () => {
    const doc = makeDoc(embed("a", YT), embed("b", YT), embed("c", "https://vimeo.com/76979871"));
    const next = setEmbedTitle(doc, YT, "Rick Astley");
    const titles = next.root.children.map((c) => (c.attrs as { title?: string }).title);
    expect(titles).toEqual(["Rick Astley", "Rick Astley", undefined]);
  });

  it("never overwrites an existing title", () => {
    const doc = makeDoc(embed("a", YT, "Hand-set"));
    expect(setEmbedTitle(doc, YT, "Fetched")).toBe(doc); // no change → SAME ref
  });

  it("returns the SAME doc reference when nothing matches (convergence)", () => {
    const doc = makeDoc(embed("a", "https://vimeo.com/76979871"));
    expect(setEmbedTitle(doc, YT, "x")).toBe(doc);
  });
});
