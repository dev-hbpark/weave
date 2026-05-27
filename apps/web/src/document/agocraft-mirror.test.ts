import { describe, expect, it } from "vitest";
import {
  fromAgocraftDocument,
  fromAgocraftItem,
  toAgocraftDocument,
  toAgocraftItem,
  unitToBehavior,
} from "./agocraft-mirror.js";
import type {
  CameraTargetBehavior,
  HotspotBehavior,
  Document as WeaveDocument,
  Item as WeaveItem,
} from "./types.js";
import { FULL_FRAME } from "./types.js";

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

// WI-032 Phase 3 — legacy slide Item retained as round-trip fixture.
const slideItem = {
  id: "slide-1",
  kind: "slide",
  attrs: { frame: FULL_FRAME, title: "Hello", bullets: ["a", "b"] },
  behaviors: [camBehavior, hotspot],
  createdAt: META_DATE,
} as unknown as WeaveItem;

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
  it("round-trips id / title and filters legacy non-frame kinds out", () => {
    const ago = toAgocraftDocument(doc);
    const back = fromAgocraftDocument(ago);
    expect(back.id).toBe("demo");
    expect(back.title).toBe("Demo doc");
    // WI-032 Phase 3 — `slide` (and the rest of the legacy 4) is no longer
    // a weave-domain kind; `fromAgocraftItem` returns undefined for them so
    // the round-trip drops the legacy slide. The migration helper
    // (`migrate-frame-only.ts`) rewrites persisted legacy data into
    // `frame` + primitives before it ever reaches this projection.
    expect(back.items).toHaveLength(0);
  });

  it("behaviors are dropped together with their legacy host item", () => {
    const ago = toAgocraftDocument(doc);
    const back = fromAgocraftDocument(ago);
    // Same reason as above — the legacy slide doesn't survive the inverse
    // mirror, so the camera / hotspot behaviors travel with it.
    expect(back.items).toHaveLength(0);
  });

  it("skips agocraft Items whose kind is not a known weave domain (e.g., root)", () => {
    const ago = toAgocraftDocument(doc);
    // root kind = "weave-doc" — should be filtered out.
    expect(fromAgocraftItem(ago.root)).toBeUndefined();
  });
});

// ── WI-032 Phase 1 — `frame` kind sanity ─────────────────────────────────
//
// `frame` is the canvas container of the new paradigm. Phase 1 only ensures
// that the kind is recognized end-to-end (createDefaultItem produces it,
// `isDomainItem` accepts it) — Phase 2 introduces the migration helper that
// rewrites legacy 4 domains as `frame` + primitive children.

import { isDomainItem } from "./agocraft-mirror.js";
import { createDefaultItem } from "./seed.js";

describe("WI-032 Phase 1 — frame kind", () => {
  it("createDefaultItem('frame', 0) produces a domain item with an empty container", () => {
    const item = createDefaultItem("frame", 0);
    expect(item.kind).toBe("frame");
    expect(item.attrs.frame).toEqual(FULL_FRAME);
    expect(item.behaviors).toHaveLength(1); // default camera-target
  });

  it("isDomainItem accepts a `frame` AgocraftItem", () => {
    const item = createDefaultItem("frame", 0);
    const ag = toAgocraftItem(item, META_DATE);
    expect(isDomainItem(ag)).toBe(true);
  });

  it("frame attrs accept optional background / cornerRadius / label", () => {
    const item = createDefaultItem("frame", 0);
    const next = {
      ...item.attrs,
      background: "var(--accent)",
      cornerRadius: 0.1,
      label: "표지",
    };
    expect(next.background).toBe("var(--accent)");
    expect(next.cornerRadius).toBe(0.1);
    expect(next.label).toBe("표지");
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
