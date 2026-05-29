// WI-058 — QR matrix wrapper tests. Structural invariants that would catch a
// broken/mis-vendored encoder (finder patterns, size, determinism).
import { describe, expect, it } from "vitest";
import { qrMatrix } from "./qr-matrix.js";

describe("qrMatrix", () => {
  it("returns a square matrix ≥ 21×21 (version 1) for a URL", () => {
    const m = qrMatrix("https://example.com");
    expect(m).not.toBeNull();
    if (m === null) return;
    expect(m.length).toBeGreaterThanOrEqual(21);
    for (const row of m) expect(row.length).toBe(m.length);
  });

  it("renders the three finder patterns (7×7) at the corners", () => {
    const m = qrMatrix("HELLO", "M");
    expect(m).not.toBeNull();
    if (m === null) return;
    const n = m.length;
    const isFinder = (oy: number, ox: number): boolean => {
      // top + bottom edges of the 7×7 finder are solid dark; the 5×5 ring at
      // offset 1 has a dark border with a light gap on row 1.
      for (let i = 0; i < 7; i++) {
        if (!m[oy]![ox + i]! || !m[oy + 6]![ox + i]!) return false; // top/bottom rows
        if (!m[oy + i]![ox]! || !m[oy + i]![ox + 6]!) return false; // left/right cols
      }
      if (m[oy + 1]![ox + 1]!) return false; // inner ring gap (light)
      return true;
    };
    expect(isFinder(0, 0)).toBe(true); // top-left
    expect(isFinder(0, n - 7)).toBe(true); // top-right
    expect(isFinder(n - 7, 0)).toBe(true); // bottom-left
  });

  it("is deterministic for the same input", () => {
    expect(qrMatrix("deterministic?", "Q")).toEqual(qrMatrix("deterministic?", "Q"));
  });

  it("encodes at every EC level", () => {
    for (const ec of ["L", "M", "Q", "H"] as const) {
      expect(qrMatrix("level test", ec)).not.toBeNull();
    }
  });

  it("returns null for empty data", () => {
    expect(qrMatrix("")).toBeNull();
  });
});
