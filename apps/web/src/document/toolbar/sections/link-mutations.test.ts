// WI-090 Phase 2 (DR-052) — link-unit authoring policy. Verifies the mapping
// from "current behavior + user intent" → the History command call, with no
// rendering in the loop (the toolbar section just dispatches these descriptors).

import { describe, expect, test } from "vitest";
import type { ButtonTriggerBehavior } from "../../types.js";
import { linkModeOf, planSetAction, planSetMode } from "./link-mutations.js";

type Action = ButtonTriggerBehavior["action"];

describe("linkModeOf", () => {
  test("classifies external → url, jump-camera → slide, else none", () => {
    expect(linkModeOf({ type: "external", href: "https://x" })).toBe("url");
    expect(linkModeOf({ type: "jump-camera", targetId: "present-f1" })).toBe("slide");
    expect(linkModeOf({ type: "next-camera" })).toBe("none");
    expect(linkModeOf(undefined)).toBe("none");
  });
});

const BASE = { itemId: "item-9", linkId: "link-item-9" };

describe("planSetAction", () => {
  test("adds a button-trigger when no link unit exists yet", () => {
    const call = planSetAction({
      ...BASE,
      unitId: undefined,
      action: { type: "external", href: "https://a" },
    });
    expect(call.cmd).toBe("weave.item.addBehavior");
    expect(call.input).toEqual({
      itemId: "item-9",
      behavior: {
        kind: "button-trigger",
        id: "link-item-9",
        action: { type: "external", href: "https://a" },
      },
    });
  });

  test("updates the existing unit's action when one is present", () => {
    const call = planSetAction({
      ...BASE,
      unitId: "u-1",
      action: { type: "jump-camera", targetId: "present-f2" },
    });
    expect(call.cmd).toBe("weave.behavior.update");
    expect(call.input).toEqual({
      itemId: "item-9",
      behaviorId: "u-1",
      behavior: { action: { type: "jump-camera", targetId: "present-f2" } },
    });
  });
});

describe("planSetMode", () => {
  const plan = (over: {
    unitId?: string;
    currentAction?: Action;
    nextMode: "none" | "url" | "slide";
    firstSlideTarget?: string;
  }) =>
    planSetMode({
      ...BASE,
      unitId: over.unitId,
      currentAction: over.currentAction,
      nextMode: over.nextMode,
      firstSlideTarget: over.firstSlideTarget,
    });

  test("none → url with no existing unit adds a default https:// link", () => {
    const call = plan({ nextMode: "url" });
    expect(call?.cmd).toBe("weave.item.addBehavior");
    expect((call?.input.behavior as ButtonTriggerBehavior).action).toEqual({
      type: "external",
      href: "https://",
    });
  });

  test("none → slide defaults to the first slide target", () => {
    const call = plan({ nextMode: "slide", firstSlideTarget: "present-f1" });
    expect(call?.cmd).toBe("weave.item.addBehavior");
    expect((call?.input.behavior as ButtonTriggerBehavior).action).toEqual({
      type: "jump-camera",
      targetId: "present-f1",
    });
  });

  test("url → slide preserves nothing and seeds first slide; keeps single unit (update)", () => {
    const call = plan({
      unitId: "u-1",
      currentAction: { type: "external", href: "https://a" },
      nextMode: "slide",
      firstSlideTarget: "present-f3",
    });
    expect(call?.cmd).toBe("weave.behavior.update");
    expect(call?.input.behaviorId).toBe("u-1");
    expect((call?.input.behavior as { action: Action }).action).toEqual({
      type: "jump-camera",
      targetId: "present-f3",
    });
  });

  test("→ none removes the existing link unit", () => {
    const call = plan({
      unitId: "u-1",
      currentAction: { type: "external", href: "https://a" },
      nextMode: "none",
    });
    expect(call).toEqual({
      cmd: "weave.item.removeBehavior",
      input: { itemId: "item-9", behaviorId: "u-1" },
    });
  });

  test("→ none with no existing unit is a no-op", () => {
    expect(plan({ nextMode: "none" })).toBeNull();
  });

  test("switching to the current mode is a no-op", () => {
    expect(
      plan({
        unitId: "u-1",
        currentAction: { type: "external", href: "https://a" },
        nextMode: "url",
      }),
    ).toBeNull();
  });

  test("slide → url preserves the prior href when re-toggling is not possible, defaults https://", () => {
    // currentAction is jump-camera, so url has no prior href → default.
    const call = plan({
      unitId: "u-1",
      currentAction: { type: "jump-camera", targetId: "present-f1" },
      nextMode: "url",
    });
    expect((call?.input as { behavior: { action: Action } }).behavior.action).toEqual({
      type: "external",
      href: "https://",
    });
  });
});
