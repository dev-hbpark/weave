import { describe, expect, it } from "vitest";
import { resolveActivePage } from "./use-active-page.js";

describe("resolveActivePage (WI-153 P2)", () => {
  it("keeps the candidate when it is still in the order", () => {
    expect(resolveActivePage(["a", "b", "c"], "b")).toBe("b");
  });

  it("falls back to the first page when the candidate is gone (deleted/reordered out)", () => {
    expect(resolveActivePage(["a", "b"], "z")).toBe("a");
  });

  it("defaults to the first page when no candidate is set yet", () => {
    expect(resolveActivePage(["a", "b"], undefined)).toBe("a");
  });

  it("returns undefined when there are no pages", () => {
    expect(resolveActivePage([], "a")).toBeUndefined();
    expect(resolveActivePage([], undefined)).toBeUndefined();
  });

  it("respects reorder — a still-present candidate stays active regardless of position", () => {
    expect(resolveActivePage(["c", "b", "a"], "a")).toBe("a");
  });
});
