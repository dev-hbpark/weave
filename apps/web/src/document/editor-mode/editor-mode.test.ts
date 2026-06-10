// WI-166 / DR-114 P1 — registry + RolePolicy unit tests. The registry rows
// must reproduce the prior scattered predicates exactly (P1 acceptance =
// zero behavior change): `isArtboardId` ⇔ roleOf === "stage", and the
// WI-163/WI-164 artboard gates ⇔ STAGE capabilities.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import type { DocFlavor } from "../types.js";
import { EDITOR_MODES, editorModeFor } from "./registry.js";
import { capabilityOf, type RolePolicy } from "./types.js";

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

const FLAVORS: DocFlavor[] = ["mixed", "slide-deck", "canvas-board", "doc-page"];

describe("EDITOR_MODES registry (DR-114)", () => {
  it("covers every DocFlavor (exhaustive record, one row per flavor)", () => {
    for (const f of FLAVORS) expect(EDITOR_MODES[f]).toBeDefined();
  });

  it("declares the same canvas mode FORMAT_EDITOR_CONFIG did", () => {
    expect(editorModeFor("mixed").mode).toBe("infinite");
    expect(editorModeFor("canvas-board").mode).toBe("infinite");
    expect(editorModeFor("slide-deck").mode).toBe("page-bounded");
    expect(editorModeFor("doc-page").mode).toBe("page-bounded");
  });

  it("defaults an undefined / unknown legacy flavor to mixed", () => {
    expect(editorModeFor(undefined)).toBe(EDITOR_MODES.mixed);
    expect(editorModeFor("legacy-unknown" as DocFlavor)).toBe(EDITOR_MODES.mixed);
  });
});

describe("RolePolicy (WI-163 absorbed predicate)", () => {
  const doc = makeDoc([makeItem("page-1", "frame", [makeItem("child-1", "frame")])]);

  it("free-placement flavors: every item is an element (no stage)", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      const { roles } = editorModeFor(f);
      expect(roles.roleOf(doc, "page-1")).toBe("element");
      expect(roles.roleOf(doc, "child-1")).toBe("element");
    }
  });

  it("page-bounded flavors: root-direct item = stage, descendants = element", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      const { roles } = editorModeFor(f);
      expect(roles.roleOf(doc, "page-1")).toBe("stage");
      expect(roles.roleOf(doc, "child-1")).toBe("element");
      expect(roles.roleOf(doc, "not-in-doc")).toBe("element");
    }
  });

  it("stage capabilities reproduce the WI-163/WI-164 artboard gates", () => {
    const caps = capabilityOf(editorModeFor("slide-deck").roles, doc, "page-1");
    expect(caps).toEqual({
      movable: false,
      resizable: false,
      rotatable: false,
      deletable: false,
      navigable: false,
      hoverable: false,
      quickActions: false,
      canvasHandles: false,
      selectable: "deep-only",
    });
  });

  it("element capabilities allow everything (lock stays orthogonal)", () => {
    const caps = capabilityOf(editorModeFor("slide-deck").roles, doc, "child-1");
    expect(
      Object.entries(caps).every(([k, v]) => (k === "selectable" ? v === "normal" : v === true)),
    ).toBe(true);
  });

  it("consumers depend on the interface only — a fake policy injects without the registry (DR-114 §2b)", () => {
    // The DI payoff: no flavor, no React tree, no registry — a consumer-side
    // test hands `capabilityOf` (the consumer call pattern) a hand-rolled
    // policy and observes the gate flip.
    const everythingIsStage: RolePolicy = {
      roleOf: () => "stage",
      capabilities: editorModeFor("slide-deck").roles.capabilities,
    };
    expect(capabilityOf(everythingIsStage, doc, "child-1").movable).toBe(false);
    expect(capabilityOf(everythingIsStage, doc, "child-1").selectable).toBe("deep-only");
  });
});
