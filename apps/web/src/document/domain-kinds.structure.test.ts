// Structural-policy guards for the DomainKind registry.
//
// `structure` is the single source of truth for the create / add / remove /
// reparent / detach verbs and the group-dissolve invariant. These guards lock
// the DESIGN contract so that adding a new kind cannot silently drift:
//   • TypeScript already forces every kind to DECLARE a `structure` (the SPECS
//     mapped type + required field) — a new kind without one is a compile error.
//   • These runtime guards force the declaration to be CONSISTENT — e.g. a kind
//     that dissolves on underflow must have a real minimum to underflow past.
//
// When a new container kind (e.g. `group`) is added, the design rule it must
// satisfy is encoded here, so an inconsistent spec fails the suite rather than
// shipping a verb that mis-handles it.

import { describe, expect, it } from "vitest";
import {
  CONTAINER_KINDS,
  canContain,
  DOMAIN_KIND_SPECS,
  isContainerKind,
  KNOWN_DOMAIN_KINDS,
  structureOf,
} from "./domain-kinds.js";
import type { DomainKind } from "./types.js";

const ALL_KINDS = [...KNOWN_DOMAIN_KINDS] as DomainKind[];

describe("domain-kinds — structural policy", () => {
  it("declares a structure for every kind (exhaustive, no silent default)", () => {
    for (const kind of ALL_KINDS) {
      expect(structureOf(kind), `${kind} must declare structure`).toBeDefined();
      expect(typeof structureOf(kind).isContainer).toBe("boolean");
    }
  });

  it("frame is the canvas container: accepts anything, may sit empty, never dissolves", () => {
    const s = DOMAIN_KIND_SPECS.frame.structure;
    expect(s.isContainer).toBe(true);
    if (s.isContainer) {
      expect(s.minChildren).toBe(0);
      expect(s.onUnderflow).toBe("keep");
      // A frame is an independent box — it does NOT shrink-wrap its children.
      expect(s.hugsChildren).toBe(false);
      for (const k of ALL_KINDS) expect(s.accepts(k)).toBe(true);
    }
  });

  it("frame and group are the containers; every other kind is a leaf", () => {
    expect([...CONTAINER_KINDS].sort()).toEqual(["frame", "group"]);
    for (const kind of ALL_KINDS) {
      if (kind === "frame" || kind === "group") continue;
      expect(structureOf(kind).isContainer, `${kind} should be a leaf`).toBe(false);
    }
  });

  it("group is a dissolving container: ≥2 children, accepts anything", () => {
    const s = DOMAIN_KIND_SPECS.group.structure;
    expect(s.isContainer).toBe(true);
    if (s.isContainer) {
      expect(s.minChildren).toBe(2);
      expect(s.onUnderflow).toBe("dissolve");
      // A group ALWAYS shrink-wraps its children (no overflow).
      expect(s.hugsChildren).toBe(true);
      for (const k of ALL_KINDS) expect(s.accepts(k)).toBe(true);
    }
  });

  // The design rule for the group-dissolve invariant: dissolve reparents the
  // sole survivor to the container's parent, which is only meaningful when the
  // container required ≥2 children. A "dissolve" with minChildren < 2 would
  // never trigger a single-survivor reparent — reject it at the spec layer.
  it("any dissolving container requires minChildren ≥ 2", () => {
    for (const kind of CONTAINER_KINDS) {
      const s = structureOf(kind);
      if (s.isContainer && s.onUnderflow === "dissolve") {
        expect(
          s.minChildren,
          `${kind} dissolves so it must require ≥2 children`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  describe("canContain — the add/reparent gate", () => {
    it("a container defers to its accepts predicate (frame accepts a text)", () => {
      expect(canContain("frame", "text")).toBe(true);
      expect(canContain("frame", "shape")).toBe(true);
    });

    it("a leaf never accepts children", () => {
      expect(canContain("text", "shape")).toBe(false);
      expect(canContain("image", "text")).toBe(false);
      expect(canContain("chart", "frame")).toBe(false);
    });
  });

  describe("isContainerKind — the string-safe containment predicate", () => {
    it("is true for every container kind, false for every leaf", () => {
      for (const kind of ALL_KINDS) {
        expect(isContainerKind(kind)).toBe(structureOf(kind).isContainer);
      }
    });

    it("frame is a container; primitives are not", () => {
      expect(isContainerKind("frame")).toBe(true);
      expect(isContainerKind("text")).toBe(false);
      expect(isContainerKind("shape")).toBe(false);
    });

    it("non-item selection strings and undefined are not containers", () => {
      // The scattered guards it replaces feed it `selectedKind` / agocraft item
      // kind, which can be undefined / "multi" / "none" / an unknown kind.
      expect(isContainerKind(undefined)).toBe(false);
      expect(isContainerKind("multi")).toBe(false);
      expect(isContainerKind("none")).toBe(false);
      expect(isContainerKind("weave-doc")).toBe(false);
    });
  });
});
