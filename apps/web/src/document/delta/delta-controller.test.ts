// @vitest-environment node
import type { Patch } from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { createDeltaPersistController, type PushPatchesResult } from "./delta-controller.js";

// A minimal stand-in patch — the controller only stringifies it.
const P = (n: number): Patch =>
  ({ type: "document.attrs", before: {}, after: { n } }) as unknown as Patch;

function harness(opts?: {
  pushPatches?: (s: ReadonlyArray<string>, base: number) => Promise<PushPatchesResult>;
  pushSnapshot?: () => Promise<boolean>;
  compactThreshold?: number;
}) {
  const pushPatches = vi.fn(
    opts?.pushPatches ??
      (async (s: ReadonlyArray<string>, base: number) => ({ ok: true, count: base + s.length })),
  );
  const pushSnapshot = vi.fn(opts?.pushSnapshot ?? (async () => true));
  const ctl = createDeltaPersistController({
    pushPatches,
    pushSnapshot,
    ...(opts?.compactThreshold !== undefined ? { compactThreshold: opts.compactThreshold } : {}),
  });
  return { ctl, pushPatches, pushSnapshot };
}

describe("createDeltaPersistController (WI-161)", () => {
  it("first flush sends a full snapshot (baseCount unknown), then baseCount=0", async () => {
    const { ctl, pushPatches, pushSnapshot } = harness();
    ctl.recordPatch(P(1));
    await ctl.flush();
    expect(pushSnapshot).toHaveBeenCalledOnce();
    expect(pushPatches).not.toHaveBeenCalled();
    expect(ctl.baseCount()).toBe(0);
    expect(ctl.pending()).toBe(0);
  });

  it("subsequent flushes send deltas with the optimistic baseCount and advance it", async () => {
    const { ctl, pushPatches } = harness();
    ctl.recordPatch(P(1));
    await ctl.flush(); // snapshot → baseCount 0
    ctl.recordPatch(P(2));
    ctl.recordPatch(P(3));
    await ctl.flush(); // delta of 2 from base 0 → count 2
    expect(pushPatches).toHaveBeenCalledOnce();
    expect(pushPatches.mock.calls[0]?.[1]).toBe(0); // baseCount sent
    expect(ctl.baseCount()).toBe(2);
    ctl.recordPatch(P(4));
    await ctl.flush(); // delta of 1 from base 2 → count 3
    expect(pushPatches.mock.calls[1]?.[1]).toBe(2);
    expect(ctl.baseCount()).toBe(3);
  });

  it("compacts (snapshot) when the log would cross the threshold", async () => {
    const { ctl, pushPatches, pushSnapshot } = harness({ compactThreshold: 3 });
    ctl.recordPatch(P(1));
    await ctl.flush(); // snapshot → base 0
    ctl.recordPatch(P(1));
    ctl.recordPatch(P(2));
    await ctl.flush(); // base 0 + 2 = 2 ≤ 3 → delta → base 2
    expect(ctl.baseCount()).toBe(2);
    expect(pushSnapshot).toHaveBeenCalledTimes(1);
    ctl.recordPatch(P(3));
    ctl.recordPatch(P(4));
    await ctl.flush(); // base 2 + 2 = 4 > 3 → compaction snapshot → base 0
    expect(pushSnapshot).toHaveBeenCalledTimes(2);
    expect(ctl.baseCount()).toBe(0);
    expect(pushPatches).toHaveBeenCalledOnce(); // only the middle flush was a delta
  });

  it("falls back to a full snapshot when an append conflicts", async () => {
    const { ctl, pushPatches, pushSnapshot } = harness({
      pushPatches: async () => ({ ok: false }), // simulate 409 conflict
    });
    ctl.recordPatch(P(1));
    await ctl.flush(); // snapshot → base 0
    ctl.recordPatch(P(2));
    await ctl.flush(); // delta attempt → conflict → snapshot fallback → base 0
    expect(pushPatches).toHaveBeenCalledOnce();
    expect(pushSnapshot).toHaveBeenCalledTimes(2);
    expect(ctl.baseCount()).toBe(0);
  });

  it("a failed snapshot leaves baseCount unknown so the next save retries a snapshot", async () => {
    let ok = false;
    const { ctl, pushSnapshot } = harness({ pushSnapshot: async () => ok });
    ctl.recordPatch(P(1));
    await ctl.flush(); // snapshot fails → base null
    expect(ctl.baseCount()).toBeNull();
    ok = true;
    ctl.recordPatch(P(2));
    await ctl.flush(); // base still null → snapshot again, now succeeds → base 0
    expect(pushSnapshot).toHaveBeenCalledTimes(2);
    expect(ctl.baseCount()).toBe(0);
  });

  it("markSnapshotBoundary drops the buffer and forces the next flush to snapshot", async () => {
    const { ctl, pushPatches, pushSnapshot } = harness();
    ctl.recordPatch(P(1));
    await ctl.flush(); // base 0
    ctl.recordPatch(P(2));
    ctl.markSnapshotBoundary(); // reset boundary
    expect(ctl.pending()).toBe(0);
    expect(ctl.baseCount()).toBeNull();
    ctl.recordPatch(P(3));
    await ctl.flush(); // base null → snapshot
    expect(pushSnapshot).toHaveBeenCalledTimes(2);
    expect(pushPatches).not.toHaveBeenCalled();
  });

  it("flushing an empty buffer is a no-op", async () => {
    const { ctl, pushPatches, pushSnapshot } = harness();
    await ctl.flush();
    expect(pushPatches).not.toHaveBeenCalled();
    expect(pushSnapshot).not.toHaveBeenCalled();
  });
});
