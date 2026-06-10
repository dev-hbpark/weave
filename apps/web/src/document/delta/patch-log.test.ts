// @vitest-environment node
import { describe, expect, it } from "vitest";
import { appendPatchLog, MAX_PATCH_LOG_ENTRIES } from "./patch-log.js";

describe("appendPatchLog — optimistic base-count guard (WI-161)", () => {
  it("appends when baseCount matches the current length", () => {
    const r = appendPatchLog(["a", "b"], 2, ["c", "d"]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.next).toEqual(["a", "b", "c", "d"]);
    expect(r.count).toBe(4);
  });

  it("appends onto an empty log (first delta after a fresh snapshot)", () => {
    const r = appendPatchLog([], 0, ["x"]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.next).toEqual(["x"]);
  });

  it("conflicts when another writer already advanced the log (base behind)", () => {
    const r = appendPatchLog(["a", "b", "c"], 2, ["d"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected conflict");
    expect(r.reason).toBe("conflict");
    expect(r.count).toBe(3); // server truth, so the client can resync
  });

  it("conflicts when base is ahead of server (e.g. log was compacted/cleared)", () => {
    const r = appendPatchLog([], 5, ["d"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected conflict");
    expect(r.reason).toBe("conflict");
    expect(r.count).toBe(0);
  });

  it("overflows (forces full-snapshot fallback) past the compaction backstop", () => {
    const current = Array.from({ length: MAX_PATCH_LOG_ENTRIES }, (_, i) => `p${i}`);
    const r = appendPatchLog(current, current.length, ["one-too-many"]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected overflow");
    expect(r.reason).toBe("overflow");
    expect(r.count).toBe(MAX_PATCH_LOG_ENTRIES);
  });

  it("does not mutate the input log", () => {
    const current = ["a", "b"];
    appendPatchLog(current, 2, ["c"]);
    expect(current).toEqual(["a", "b"]);
  });
});
