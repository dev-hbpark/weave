// WI-139 — embed kind registration: every registry the kind must appear in.

import { describe, expect, it } from "vitest";
import {
  DESIGN_FRAME_KINDS,
  DOMAIN_REGISTRY,
  DOMAIN_RENDERERS,
  defaultAttrsFor,
  KNOWN_DOMAIN_KINDS,
} from "../domain-kinds.js";
import { toolbarSectionRegistry } from "../toolbar/sections/index.js";
import type { EmbedAttrs } from "../types.js";

describe("embed kind registration", () => {
  it("is a known domain kind with a renderer + meta", () => {
    expect(KNOWN_DOMAIN_KINDS.has("embed")).toBe(true);
    expect(DOMAIN_RENDERERS.embed).toBeDefined();
    expect(DOMAIN_REGISTRY.embed.label).toBe("임베드");
    expect(DOMAIN_REGISTRY.embed.accentVar).toBe("--domain-media-accent");
  });

  it("participates in z-order (visual primitive)", () => {
    expect(DESIGN_FRAME_KINDS).toContain("embed");
  });

  it("seeds an empty url + fullscreen default", () => {
    const a = defaultAttrsFor("embed") as EmbedAttrs;
    expect(a.url).toBe("");
    expect(a.allowFullscreen).toBe(true);
    expect(a.frame).toBeDefined();
  });

  it("has a toolbar section registered", () => {
    expect(toolbarSectionRegistry.resolve("embed")).toBeDefined();
  });
});
