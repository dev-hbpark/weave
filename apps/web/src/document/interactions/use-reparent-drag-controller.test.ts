// WI-039 — Pure helpers for the reparent drag controller. The hook
// itself drives DOM listeners + React state and is exercised by e2e
// (P3). These tests cover the modifier predicate, frame-id extraction,
// and the cycle-blocked set computation — all pure functions safe to
// unit-test without jsdom.

import type {
  Document as AgocraftDocument,
  Item as AgocraftItem,
} from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { addChild, toAgocraftDocument } from "../agocraft-mirror.js";
import type { Item, Document as WeaveDocument } from "../types.js";
import { FULL_FRAME } from "../types.js";
import {
  disabledDropTargets,
  frameIdFromTarget,
  isReparentModifier,
} from "./use-reparent-drag-controller.js";

describe("WI-039 — isReparentModifier", () => {
  function ev(
    overrides: Partial<{
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
      altKey: boolean;
    }>,
  ): MouseEvent {
    return {
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as MouseEvent;
  }

  it("Cmd + Shift on macOS arms the gesture", () => {
    expect(isReparentModifier(ev({ metaKey: true, shiftKey: true }))).toBe(true);
  });

  it("Ctrl + Shift on Windows arms the gesture", () => {
    expect(isReparentModifier(ev({ ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("Shift alone is NOT enough (would collide with additive selection)", () => {
    expect(isReparentModifier(ev({ shiftKey: true }))).toBe(false);
  });

  it("Cmd alone is NOT enough (would collide with deep-select click)", () => {
    expect(isReparentModifier(ev({ metaKey: true }))).toBe(false);
  });

  it("Alt + Shift is NOT enough (Alt is the copy-mode slot)", () => {
    expect(isReparentModifier(ev({ altKey: true, shiftKey: true }))).toBe(false);
  });
});

describe("WI-039 — frameIdFromTarget", () => {
  function el(): HTMLDivElement {
    const div = document.createElement("div");
    div.setAttribute("data-frame-id", "frame-42");
    return div;
  }

  it("returns the data-frame-id of the closest ancestor", () => {
    const host = el();
    const child = document.createElement("span");
    host.appendChild(child);
    expect(frameIdFromTarget(child)).toBe("frame-42");
  });

  it("returns null when target is not under a frame", () => {
    const orphan = document.createElement("div");
    expect(frameIdFromTarget(orphan)).toBeNull();
  });

  it("returns null when target is null / not an Element (e.g. window)", () => {
    expect(frameIdFromTarget(null)).toBeNull();
    expect(frameIdFromTarget(window as unknown as EventTarget)).toBeNull();
  });
});

describe("WI-039 — disabledDropTargets", () => {
  const META_DATE = "2026-05-22T00:00:00Z";
  function frameWith(id: string): Item {
    return {
      id,
      kind: "frame",
      attrs: { frame: FULL_FRAME },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
  }
  function nestedFrame(id: string): AgocraftItem {
    return {
      id: makeItemId(id),
      kind: "frame",
      attrs: { frame: FULL_FRAME },
      units: [],
      children: [],
      meta: {
        createdAt: META_DATE,
        updatedAt: META_DATE,
        schemaVersion: 9,
      } as AgocraftItem["meta"],
    };
  }

  /** Doc:
   *   root
   *   ├─ p1
   *   │   ├─ c1
   *   │   └─ c2
   *   └─ p2
   */
  function makeDoc(): AgocraftDocument {
    const weave: WeaveDocument = {
      id: "doc",
      title: "doc",
      items: [frameWith("p1"), frameWith("p2")],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    let doc = toAgocraftDocument(weave);
    doc = addChild(doc, nestedFrame("c1"), "p1");
    doc = addChild(doc, nestedFrame("c2"), "p1");
    return doc;
  }

  it("blocks the item itself", () => {
    const doc = makeDoc();
    const blocked = disabledDropTargets(doc, ["c1"]);
    expect(blocked.has("c1")).toBe(true);
  });

  it("blocks every descendant of the item (and the item itself)", () => {
    const doc = makeDoc();
    const blocked = disabledDropTargets(doc, ["p1"]);
    expect(blocked.has("p1")).toBe(true);
    expect(blocked.has("c1")).toBe(true);
    expect(blocked.has("c2")).toBe(true);
  });

  it("does NOT block sibling frames", () => {
    const doc = makeDoc();
    const blocked = disabledDropTargets(doc, ["p1"]);
    expect(blocked.has("p2")).toBe(false);
  });

  it("unions blocked sets across multiple input items", () => {
    const doc = makeDoc();
    const blocked = disabledDropTargets(doc, ["c1", "p2"]);
    expect(blocked.has("c1")).toBe(true);
    expect(blocked.has("p2")).toBe(true);
    expect(blocked.has("c2")).toBe(false);
    expect(blocked.has("p1")).toBe(false);
  });
});
