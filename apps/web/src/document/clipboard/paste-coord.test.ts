// WI-185 ⑫ (spec D-5) — paste coordinate contract. Locks the three
// resolution paths of `resolvePasteFrame`: pointer-centred (cursor model),
// keyboard offset fallback, and the office contract (page-bounded flavors).
// NOTE the kit increments its paste-stack counter BEFORE resolving, so the
// first paste after a copy arrives with `pasteIndex === 1`.

import { describe, expect, it } from "vitest";
import type { ItemFrame } from "../types.js";
import {
  isOfficePasteHint,
  officePasteHint,
  PASTE_OFFSET_PX,
  resolvePasteFrame,
} from "./paste-coord.js";

const SOURCE: ItemFrame = { x: 0.2, y: 0.3, width: 0.4, height: 0.2, rotation: 0 };
const CONTAINER = { width: 800, height: 400 };

describe("resolvePasteFrame — pointer path (cursor model)", () => {
  it("centres the pasted frame at the pointer, size preserved", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 1,
      pointerInContainer: { x: 400, y: 200 },
    });
    expect(out.x).toBeCloseTo(0.5 - SOURCE.width / 2);
    expect(out.y).toBeCloseTo(0.5 - SOURCE.height / 2);
    expect(out.width).toBe(SOURCE.width);
    expect(out.height).toBe(SOURCE.height);
  });
});

describe("resolvePasteFrame — keyboard fallback", () => {
  it("first paste lands 8px off the source (min one step)", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 1,
    });
    expect(out.x).toBeCloseTo(SOURCE.x + PASTE_OFFSET_PX / CONTAINER.width);
    expect(out.y).toBeCloseTo(SOURCE.y + PASTE_OFFSET_PX / CONTAINER.height);
  });

  it("repeat pastes fan out diagonally", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 3,
    });
    expect(out.x).toBeCloseTo(SOURCE.x + (PASTE_OFFSET_PX * 3) / CONTAINER.width);
  });
});

describe("resolvePasteFrame — office contract (WI-185 ⑫)", () => {
  it("cross-page first paste preserves the source frame EXACTLY", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 1, // kit's first-paste index
      officeContract: { sameContainer: false },
    });
    expect(out).toEqual(SOURCE);
  });

  it("cross-page repeat pastes stack by 8px per repeat", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 2,
      officeContract: { sameContainer: false },
    });
    expect(out.x).toBeCloseTo(SOURCE.x + PASTE_OFFSET_PX / CONTAINER.width);
    expect(out.y).toBeCloseTo(SOURCE.y + PASTE_OFFSET_PX / CONTAINER.height);
  });

  it("same-page paste keeps the keyboard stack (never exactly on the source)", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 1,
      officeContract: { sameContainer: true },
    });
    expect(out.x).toBeCloseTo(SOURCE.x + PASTE_OFFSET_PX / CONTAINER.width);
  });

  it("office contract wins over a (stale) pointer", () => {
    const out = resolvePasteFrame({
      sourceFrame: SOURCE,
      containerSizePx: CONTAINER,
      pasteIndex: 1,
      pointerInContainer: { x: 400, y: 200 },
      officeContract: { sameContainer: false },
    });
    expect(out).toEqual(SOURCE);
  });
});

describe("officePasteHint / isOfficePasteHint", () => {
  it("round-trips through the opaque kit channel", () => {
    expect(isOfficePasteHint(officePasteHint(true))).toBe(true);
    expect(isOfficePasteHint(officePasteHint(false))).toBe(true);
  });

  it("rejects pointer shapes and junk", () => {
    expect(isOfficePasteHint({ x: 10, y: 20 })).toBe(false);
    expect(isOfficePasteHint(undefined)).toBe(false);
    expect(isOfficePasteHint(null)).toBe(false);
    expect(isOfficePasteHint({ office: true })).toBe(false);
    expect(isOfficePasteHint({ office: "yes", sameContainer: true })).toBe(false);
  });
});
