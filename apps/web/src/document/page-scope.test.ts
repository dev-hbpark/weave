// WI-153 P4 — scope a doc snapshot to visible pages (rubber-band hit-test input).

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { scopeDocumentToPages } from "./page-scope.js";

function makeItem(id: string, kind: string, children: AgocraftItem[] = []): AgocraftItem {
  return {
    id: makeItemId(id),
    kind,
    attrs: {},
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 },
  };
}

function makeDoc(children: AgocraftItem[]): AgocraftDocument {
  return { root: makeItem("root", "weave-doc", children) } as AgocraftDocument;
}

describe("scopeDocumentToPages", () => {
  it("passthrough when pages is undefined (infinite canvas) — same reference", () => {
    const doc = makeDoc([makeItem("a", "frame"), makeItem("b", "frame")]);
    expect(scopeDocumentToPages(doc, undefined)).toBe(doc);
  });

  it("passthrough when doc is undefined", () => {
    expect(scopeDocumentToPages(undefined, new Set(["a"]))).toBeUndefined();
  });

  it("filters root children to the visible pages, keeping their subtrees", () => {
    const nested = makeItem("a-child", "frame");
    const doc = makeDoc([
      makeItem("a", "frame", [nested]),
      makeItem("b", "frame"),
      makeItem("c", "frame"),
    ]);
    const scoped = scopeDocumentToPages(doc, new Set(["a"]));
    expect(scoped?.root.children.map((c) => String(c.id))).toEqual(["a"]);
    expect(scoped?.root.children[0]?.children.map((c) => String(c.id))).toEqual(["a-child"]);
  });

  it("does not mutate the original document", () => {
    const doc = makeDoc([makeItem("a", "frame"), makeItem("b", "frame")]);
    scopeDocumentToPages(doc, new Set(["b"]));
    expect(doc.root.children.map((c) => String(c.id))).toEqual(["a", "b"]);
  });
});
