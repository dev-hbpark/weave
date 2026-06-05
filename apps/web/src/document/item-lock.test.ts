// DR-061 — `isItemLocked` accessor.

import { expect, test } from "vitest";
import { isItemLocked } from "./types.js";

test("isItemLocked reads the weave-local `locked` flag, kind-agnostically", () => {
  expect(isItemLocked({ attrs: { locked: true } })).toBe(true);
  expect(isItemLocked({ attrs: { locked: false } })).toBe(false);
  // Unset / unknown → not locked (default).
  expect(isItemLocked({ attrs: {} })).toBe(false);
  expect(isItemLocked({ attrs: { text: "hi" } })).toBe(false);
  // Non-boolean truthy values do NOT count as locked (strict === true).
  expect(isItemLocked({ attrs: { locked: 1 as unknown as boolean } })).toBe(false);
});
