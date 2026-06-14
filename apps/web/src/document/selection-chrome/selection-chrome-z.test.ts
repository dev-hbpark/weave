// Locks the selection-chrome stacking contract (DR-design-033). The whole point
// of centralising these z-indexes was to stop a POINT handle (draggable dot)
// ever ending up behind a LINE handle (draggable stroke) that crosses it. If a
// future edit reorders the tiers, this fails instead of shipping an unclickable
// handle.

import { SelectionChromeZ } from "@weave/design-system";
import { describe, expect, it } from "vitest";

describe("SelectionChromeZ — selection-chrome stacking contract", () => {
  it("orders the families: hover < line < marquee < point", () => {
    const { hoverAffordance, lineHandle, marquee, pointHandle } = SelectionChromeZ;
    expect(hoverAffordance).toBeLessThan(lineHandle);
    expect(lineHandle).toBeLessThan(marquee);
    expect(marquee).toBeLessThan(pointHandle);
  });

  it("POINT handles paint above LINE handles (the core invariant)", () => {
    expect(SelectionChromeZ.pointHandle).toBeGreaterThan(SelectionChromeZ.lineHandle);
  });

  it("hover affordance sits below ALL selection chrome", () => {
    const { hoverAffordance, lineHandle, marquee, pointHandle } = SelectionChromeZ;
    expect(hoverAffordance).toBeLessThan(Math.min(lineHandle, marquee, pointHandle));
  });

  it("all selection chrome stays below the floating overlay floor (toolbar z 46)", () => {
    const OVERLAY_FLOOR = 46;
    for (const z of Object.values(SelectionChromeZ)) {
      expect(z).toBeLessThan(OVERLAY_FLOOR);
    }
  });
});
