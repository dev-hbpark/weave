// WI-089 — export-import pure core: round-trip + validation.

import type { Document as AgocraftDocument, Item, SerializedItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { MAX_PASTE_NODES } from "../clipboard/clipboard-types.js";
import {
  buildExportFile,
  parseExportFile,
  serializeExportFile,
  WEAVE_EXPORT_FILE_VERSION,
  WEAVE_EXPORT_MAGIC,
} from "./export-import.js";

const ENV = { appVersion: "test", origin: "origin-1", now: () => 1_700_000_000_000 };

const META = {
  createdAt: "2026-06-04T00:00:00Z",
  updatedAt: "2026-06-04T00:00:00Z",
  schemaVersion: 1,
} as unknown as Item["meta"];

/** Build a real in-memory Item (branded ids) so `findItemDeep` +
 *  `serializeItemSubtree` exercise the genuine path. */
function makeItem(id: string, children: Item[] = []): Item {
  return {
    id: id as unknown as Item["id"],
    kind: "shape",
    attrs: { frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
    units: [],
    children,
    meta: META,
  };
}

/** Minimal document whose root holds `items` as top-level children. */
function makeDoc(items: Item[]): AgocraftDocument {
  const root = makeItem("root", items);
  return { root } as unknown as AgocraftDocument;
}

describe("WI-089 buildExportFile", () => {
  it("serialises a single selected subtree into a valid envelope", () => {
    const doc = makeDoc([makeItem("a", [makeItem("a1")])]);
    const res = buildExportFile(doc, ["a"], ENV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value._weave).toBe(WEAVE_EXPORT_MAGIC);
    expect(res.value.fileVersion).toBe(WEAVE_EXPORT_FILE_VERSION);
    expect(res.value.itemCount).toBe(1);
    expect(res.value.payload.kind).toBe("weave/items.v1");
    expect(res.value.payload.data.items?.length).toBe(1);
    expect(res.value.payload.data.item.id).toBe("a");
    expect(res.value.payload.data.item.children[0]?.id).toBe("a1");
  });

  it("preserves selection order across multiple items", () => {
    const doc = makeDoc([makeItem("a"), makeItem("b"), makeItem("c")]);
    const res = buildExportFile(doc, ["c", "a"], ENV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.payload.data.items?.map((i) => i.id)).toEqual(["c", "a"]);
    // `item` is the primary (first in selection order) for old-reader fallback.
    expect(res.value.payload.data.item.id).toBe("c");
  });

  it("skips ids that no longer resolve, keeps the rest", () => {
    const doc = makeDoc([makeItem("a")]);
    const res = buildExportFile(doc, ["ghost", "a"], ENV);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.payload.data.items?.map((i) => i.id)).toEqual(["a"]);
  });

  it("fails on an empty selection", () => {
    const res = buildExportFile(makeDoc([]), [], ENV);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("empty-selection");
  });

  it("fails when no selected id resolves", () => {
    const res = buildExportFile(makeDoc([makeItem("a")]), ["ghost"], ENV);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("no-serialisable-items");
  });

  it("refuses a subtree above the node cap", () => {
    const deepChildren: Item[] = [];
    for (let i = 0; i < MAX_PASTE_NODES + 5; i++) deepChildren.push(makeItem(`c${i}`));
    const doc = makeDoc([makeItem("big", deepChildren)]);
    const res = buildExportFile(doc, ["big"], ENV);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("subtree-too-large");
  });
});

describe("WI-089 round-trip", () => {
  it("export → serialize → parse yields the same items", () => {
    const doc = makeDoc([makeItem("a", [makeItem("a1"), makeItem("a2")]), makeItem("b")]);
    const built = buildExportFile(doc, ["a", "b"], ENV);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const text = serializeExportFile(built.value);
    const parsed = parseExportFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.kind).toBe("weave/items.v1");
    expect(parsed.value.data.items?.map((i) => i.id)).toEqual(["a", "b"]);
    expect(parsed.value.data.items?.[0]?.children.map((c) => c.id)).toEqual(["a1", "a2"]);
  });
});

describe("WI-089 parseExportFile rejection", () => {
  it("rejects non-JSON", () => {
    const res = parseExportFile("}{ not json");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("not-json");
  });

  it("rejects a foreign JSON file (no magic)", () => {
    const res = parseExportFile(JSON.stringify({ hello: "world" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("not-a-weave-file");
  });

  it("rejects a newer file version", () => {
    const res = parseExportFile(
      JSON.stringify({ _weave: WEAVE_EXPORT_MAGIC, fileVersion: 99, payload: {} }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("unsupported-file-version");
  });

  it("rejects an unsupported payload schema/kind", () => {
    const res = parseExportFile(
      JSON.stringify({
        _weave: WEAVE_EXPORT_MAGIC,
        fileVersion: WEAVE_EXPORT_FILE_VERSION,
        payload: { schemaVersion: 2, kind: "weave/items.v1", data: {} },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("unsupported-payload");
  });

  it("rejects malformed item data", () => {
    const badItem = { id: "x" } as unknown as SerializedItem; // missing kind/attrs/units/children
    const res = parseExportFile(
      JSON.stringify({
        _weave: WEAVE_EXPORT_MAGIC,
        fileVersion: WEAVE_EXPORT_FILE_VERSION,
        payload: {
          schemaVersion: 1,
          kind: "weave/items.v1",
          data: { item: badItem, items: [badItem], relations: [] },
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("malformed-payload");
  });
});
