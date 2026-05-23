import { describe, expect, it } from "vitest";
import {
  fromAgocraftDocument,
  fromAgocraftItem,
  toAgocraftDocument,
  toAgocraftItem,
  unitToBehavior,
} from "./agocraft-mirror.js";
import { FULL_FRAME } from "./types.js";
import type {
  CameraTargetBehavior,
  Document as WeaveDocument,
  HotspotBehavior,
  Item as WeaveItem,
} from "./types.js";

const META_DATE = "2026-05-22T00:00:00Z";

const camBehavior: CameraTargetBehavior = {
  kind: "camera-target",
  id: "cam-1",
  position: { x: 0, y: 0 },
  scale: 1,
  order: 0,
  label: "Scene 1",
};

const hotspot: HotspotBehavior = {
  kind: "hotspot",
  id: "hot-1",
  region: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
  trigger: "click",
  action: { type: "next-camera" },
};

const slideItem: WeaveItem = {
  id: "slide-1",
  kind: "slide",
  attrs: { frame: FULL_FRAME, title: "Hello", bullets: ["a", "b"] },
  behaviors: [camBehavior, hotspot],
  createdAt: META_DATE,
};

const doc: WeaveDocument = {
  id: "demo",
  title: "Demo doc",
  items: [slideItem],
  updatedAt: META_DATE,
  schemaVersion: 3,
};

describe("toAgocraftDocument", () => {
  it("wraps the doc in a synthetic root Item with kind 'weave-doc'", () => {
    const ag = toAgocraftDocument(doc);
    expect(ag.id).toBe("demo");
    expect(ag.root.kind).toBe("weave-doc");
    expect(ag.root.children).toHaveLength(1);
  });

  it("carries weave title in root.attrs and meta.userMeta", () => {
    const ag = toAgocraftDocument(doc);
    expect(ag.root.attrs.title).toBe("Demo doc");
    expect(ag.meta.userMeta?.title).toBe("Demo doc");
  });

  it("converts each weave item into an agocraft Item with branded id", () => {
    const ag = toAgocraftDocument(doc);
    const child = ag.root.children[0];
    expect(child).toBeDefined();
    if (child === undefined) return;
    expect(child.kind).toBe("slide");
    expect(child.attrs).toEqual({ frame: FULL_FRAME, title: "Hello", bullets: ["a", "b"] });
  });

  it("maps each behavior to a Unit whose kind matches the behavior kind", () => {
    const ag = toAgocraftDocument(doc);
    const child = ag.root.children[0];
    if (child === undefined) throw new Error("expected child");
    expect(child.units).toHaveLength(2);
    expect(child.units.map((u) => u.kind).sort()).toEqual(["camera-target", "hotspot"]);
  });
});

describe("toAgocraftItem", () => {
  it("preserves the weave item's createdAt in meta", () => {
    const ag = toAgocraftItem(slideItem, "2026-05-23T00:00:00Z");
    expect(ag.meta.createdAt).toBe(META_DATE);
    expect(ag.meta.updatedAt).toBe("2026-05-23T00:00:00Z");
  });
});

describe("fromAgocraftDocument — inverse mirror (Phase 3)", () => {
  it("round-trips a weave Document → agocraft → weave preserving id / title / items", () => {
    const ago = toAgocraftDocument(doc);
    const back = fromAgocraftDocument(ago);
    expect(back.id).toBe("demo");
    expect(back.title).toBe("Demo doc");
    expect(back.items).toHaveLength(1);
    expect(back.items[0]?.id).toBe("slide-1");
    expect(back.items[0]?.kind).toBe("slide");
    expect(back.items[0]?.attrs).toEqual({ frame: FULL_FRAME, title: "Hello", bullets: ["a", "b"] });
  });

  it("round-trips behaviors via units", () => {
    const ago = toAgocraftDocument(doc);
    const back = fromAgocraftDocument(ago);
    expect(back.items[0]?.behaviors).toHaveLength(2);
    const kinds = back.items[0]?.behaviors.map((b) => b.kind).sort();
    expect(kinds).toEqual(["camera-target", "hotspot"]);
  });

  it("skips agocraft Items whose kind is not a known weave domain (e.g., root)", () => {
    const ago = toAgocraftDocument(doc);
    // root kind = "weave-doc" — should be filtered out.
    expect(fromAgocraftItem(ago.root)).toBeUndefined();
  });
});

describe("unitToBehavior", () => {
  it("round-trips a camera-target behavior through a Unit", () => {
    const ag = toAgocraftItem(slideItem, META_DATE);
    const cam = ag.units.find((u) => u.kind === "camera-target");
    if (cam === undefined) throw new Error("expected camera-target unit");
    const back = unitToBehavior(cam);
    expect(back).toEqual(camBehavior);
  });

  it("returns undefined for a Unit kind it doesn't recognize", () => {
    const ag = toAgocraftItem(slideItem, META_DATE);
    const cam = ag.units.find((u) => u.kind === "camera-target");
    if (cam === undefined) throw new Error("expected unit");
    const tampered = { ...cam, attrs: {} };
    expect(unitToBehavior(tampered)).toBeUndefined();
  });
});
