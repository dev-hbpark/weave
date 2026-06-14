// WI-226 — agent guards must reach inside a weave.batch (the inner ops bypass
// transformInput, calling the internal command directly).

import { describe, expect, it } from "vitest";
import { applyAgentGuardChain, type GuardOne } from "./agent-batch-guard.js";
import { stampGridCapacityGuard } from "./agent-grid-capacity-guard.js";

// A representative guard chain: stamp the grid-capacity flag (the one that drives
// growToFit). Mirrors the real transformInput's per-op chain shape.
const guardOne: GuardOne = (name, input) => stampGridCapacityGuard(name, input);

describe("applyAgentGuardChain (WI-226)", () => {
  it("stamps enforceGridCapacity on a TOP-LEVEL weave.item.add", () => {
    const out = applyAgentGuardChain("weave.item.add", { kind: "shape" }, guardOne) as {
      enforceGridCapacity?: boolean;
    };
    expect(out.enforceGridCapacity).toBe(true);
  });

  it("stamps enforceGridCapacity on EACH inner item.add of a weave.batch", () => {
    const input = {
      ops: [
        { command: "weave.frame.setLayout", input: { itemId: "g", layout: {} } },
        { command: "weave.item.add", input: { kind: "shape", containerId: "g" } },
        { command: "weave.item.add", input: { kind: "text", containerId: "g" } },
      ],
    };
    const out = applyAgentGuardChain("weave.batch", input, guardOne) as {
      ops: Array<{ command: string; input: { enforceGridCapacity?: boolean } }>;
    };
    // setLayout op untouched, both adds stamped.
    expect(out.ops[0]?.input.enforceGridCapacity).toBeUndefined();
    expect(out.ops[1]?.input.enforceGridCapacity).toBe(true);
    expect(out.ops[2]?.input.enforceGridCapacity).toBe(true);
    // The op's own command name is preserved (the batch resolves it).
    expect(out.ops[1]?.command).toBe("weave.item.add");
  });

  it("normalizes the underscore tool form (weave_item_add) so the dot-keyed guard fires", () => {
    const input = { ops: [{ command: "weave_item_add", input: { kind: "shape" } }] };
    const out = applyAgentGuardChain("weave_batch", input, guardOne) as {
      ops: Array<{ command: string; input: { enforceGridCapacity?: boolean } }>;
    };
    expect(out.ops[0]?.input.enforceGridCapacity).toBe(true);
    expect(out.ops[0]?.command).toBe("weave_item_add"); // command form left as the agent sent it
  });

  it("is a no-op for a batch with no ops / malformed input", () => {
    expect(applyAgentGuardChain("weave.batch", {}, guardOne)).toEqual({});
    expect(applyAgentGuardChain("weave.batch", null, guardOne)).toBeNull();
  });
});
