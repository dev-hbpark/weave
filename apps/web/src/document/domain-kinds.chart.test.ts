// WI-077 Phase 2 — chart kind registration guards (DR-031).
//
// The single DomainKind registry (domain-kinds.ts) is the one place a kind is
// declared; every consumer derives from it (renderer map, KNOWN_DOMAIN_KINDS
// membership = the FrameStage cull gate, DESIGN_FRAME_KINDS z-order set, seed
// defaults). These guards prove `chart` is wired through all of them — the
// "render gate" the QR work item flagged (a kind missing from the membership
// set exists in the doc but never mounts, silently).

import type { Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { isDomainItem } from "./agocraft-mirror.js";
import {
  DESIGN_FRAME_KINDS,
  DOMAIN_KIND_SPECS,
  DOMAIN_RENDERERS,
  defaultAttrsFor,
  KNOWN_DOMAIN_KINDS,
} from "./domain-kinds.js";

describe("domain-kinds — chart registration", () => {
  it("has a spec with a renderer and chart meta", () => {
    const spec = DOMAIN_KIND_SPECS.chart;
    expect(spec.kind).toBe("chart");
    expect(spec.meta.label).toBe("Chart");
    expect(DOMAIN_RENDERERS.chart).toBe(spec.renderer);
  });

  it("is in the membership set (FrameStage cull gate) — the render gate", () => {
    expect(KNOWN_DOMAIN_KINDS.has("chart")).toBe(true);
    const chartItem = { kind: "chart" } as unknown as AgocraftItem;
    expect(isDomainItem(chartItem)).toBe(true);
  });

  it("participates in z-order (unlike qr)", () => {
    expect(DESIGN_FRAME_KINDS).toContain("chart");
  });

  it("seeds an empty-reference chart (datasetId '', bar, no series)", () => {
    const attrs = defaultAttrsFor("chart");
    expect(attrs.datasetId).toBe("");
    expect(attrs.chartType).toBe("bar");
    // DR-036 — empty channel encoding until a dataset is attached.
    expect(attrs.encoding).toEqual({});
    // Fresh object each call (no shared mutable seed).
    expect(defaultAttrsFor("chart")).not.toBe(attrs);
  });
});
