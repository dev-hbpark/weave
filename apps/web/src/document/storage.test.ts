// WI-013 Phase 3 — v4 storage round-trip via the agocraft Serializer.
//
// localStorage is exercised by the e2e suite (it depends on a real browser
// implementation — vitest's jsdom 29 ships a Storage stub without
// getItem/setItem/removeItem methods, so we test the serialize / deserialize /
// projection pipeline in isolation here).

import {
  createFeatureRegistry,
  createSchema,
  createSerializer,
} from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { fromAgocraftDocument, toAgocraftDocument } from "./agocraft-mirror.js";
import { FULL_FRAME } from "./types.js";
import type {
  CameraTargetBehavior,
  Document,
  HotspotBehavior,
  Item,
} from "./types.js";

const META_DATE = "2026-05-22T00:00:00Z";
const camBehavior: CameraTargetBehavior = {
  kind: "camera-target",
  id: "cam-1",
  position: { x: 0, y: 0 },
  scale: 1,
  order: 0,
};
const hotspot: HotspotBehavior = {
  kind: "hotspot",
  id: "hot-1",
  region: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
  trigger: "click",
  action: { type: "next-camera" },
};
// WI-032 Phase 3 — legacy slide Item retained for round-trip coverage.
const slideItem = {
  id: "slide-1",
  kind: "slide",
  attrs: { frame: FULL_FRAME, title: "Hello", bullets: ["a", "b"] },
  behaviors: [camBehavior, hotspot],
  createdAt: META_DATE,
} as unknown as Item;
const doc: Document = {
  id: "test-doc",
  title: "Storage round-trip",
  items: [slideItem],
  updatedAt: META_DATE,
  schemaVersion: 3,
};

describe("WI-013 Phase 3 — agocraft Serializer round-trip", () => {
  it("toJSON produces a SerializedDocument under the canonical schema", () => {
    const serializer = createSerializer();
    const ago = toAgocraftDocument(doc);
    const serialized = serializer.toJSON(ago);
    expect(serialized.$schema).toBe("agocraft.document/v1");
    expect(serialized.root.id).toBe("test-doc-root");
    expect(serialized.root.kind).toBe("weave-doc");
    expect(serialized.root.children).toHaveLength(1);
  });

  it("fromJSON re-hydrates an agocraft Document with the same items", () => {
    const serializer = createSerializer();
    const ago = toAgocraftDocument(doc);
    const serialized = serializer.toJSON(ago);
    const json = JSON.parse(JSON.stringify(serialized));
    const result = serializer.fromJSON(json, {
      schema: createSchema(),
      features: createFeatureRegistry(),
      onUnknown: "preserve",
    });
    if (!result.ok) throw new Error("expected fromJSON to succeed");
    expect(result.document.root.children).toHaveLength(1);
    const child = result.document.root.children[0];
    expect(child?.kind).toBe("slide");
    expect(child?.attrs.title).toBe("Hello");
  });

  it("projects re-hydrated agocraft Document back to weave shape", () => {
    const serializer = createSerializer();
    const ago = toAgocraftDocument(doc);
    const serialized = serializer.toJSON(ago);
    const result = serializer.fromJSON(JSON.parse(JSON.stringify(serialized)), {
      schema: createSchema(),
      features: createFeatureRegistry(),
      onUnknown: "preserve",
    });
    if (!result.ok) throw new Error("expected fromJSON to succeed");
    const back = fromAgocraftDocument(result.document);
    expect(back.id).toBe("test-doc");
    expect(back.title).toBe("Storage round-trip");
    // WI-032 Phase 3 — `fromAgocraftDocument` only round-trips `frame`
    // Items now; the legacy slide fixture used here gets filtered out at
    // the projection boundary. End-to-end persistence with frame Items
    // is covered by the e2e suite + `migrate-frame-only.test.ts`.
    expect(back.items).toHaveLength(0);
  });

  it("agocraft preserves camera-target unit attrs through full JSON round-trip", () => {
    // WI-032 Phase 3 — fixture uses a legacy slide kind that no longer
    // survives the weave-level projection; we inspect the underlying
    // agocraft Item directly to confirm the unit payload (camera-target
    // attrs) round-trips through the serializer regardless.
    const serializer = createSerializer();
    const ago = toAgocraftDocument(doc);
    const json = JSON.parse(JSON.stringify(serializer.toJSON(ago)));
    const result = serializer.fromJSON(json, {
      schema: createSchema(),
      features: createFeatureRegistry(),
      onUnknown: "preserve",
    });
    if (!result.ok) throw new Error("expected fromJSON to succeed");
    const firstChild = result.document.root.children[0];
    const unit = firstChild?.units.find((u) => u.kind === "camera-target");
    expect(unit).toBeDefined();
    const carried = (unit?.attrs.behavior ?? {}) as {
      readonly id?: string;
      readonly position?: { readonly x: number; readonly y: number };
      readonly scale?: number;
      readonly order?: number;
    };
    expect(carried.id).toBe("cam-1");
    expect(carried.position).toEqual({ x: 0, y: 0 });
    expect(carried.scale).toBe(1);
    expect(carried.order).toBe(0);
  });
});
