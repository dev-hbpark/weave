// WI-153 P4 — agent root-add retarget onto the active page (page-bounded formats).
import { describe, expect, it } from "vitest";
import { retargetAgentRootAdd } from "./agent-page-target.js";

const ROOT = "root-1";
const PAGE = "page-1";

describe("retargetAgentRootAdd", () => {
  it("rewrites an omitted containerId (defaults to root) to the active page", () => {
    const out = retargetAgentRootAdd("weave.item.add", { kind: "text" }, ROOT, PAGE);
    expect(out).toEqual({ kind: "text", containerId: PAGE });
  });

  it("rewrites an explicit root containerId to the active page", () => {
    const out = retargetAgentRootAdd(
      "weave.item.add",
      { kind: "shape", containerId: ROOT },
      ROOT,
      PAGE,
    );
    expect(out).toEqual({ kind: "shape", containerId: PAGE });
  });

  it("leaves a frame add at the root — a top-level frame IS a new page", () => {
    const input = { kind: "frame", containerId: ROOT };
    expect(retargetAgentRootAdd("weave.item.add", input, ROOT, PAGE)).toBe(input);
  });

  it("leaves a non-root container untouched (agent targeted a real frame)", () => {
    const input = { kind: "text", containerId: "frame-7" };
    expect(retargetAgentRootAdd("weave.item.add", input, ROOT, PAGE)).toBe(input);
  });

  it("no-op without a default container (infinite-canvas formats)", () => {
    const input = { kind: "text" };
    expect(retargetAgentRootAdd("weave.item.add", input, ROOT, undefined)).toBe(input);
  });

  it("no-op when the default container IS the root (degenerate host state)", () => {
    const input = { kind: "text" };
    expect(retargetAgentRootAdd("weave.item.add", input, ROOT, ROOT)).toBe(input);
  });

  it("no-op for other commands and non-object input", () => {
    const input = { kind: "text" };
    expect(retargetAgentRootAdd("weave.item.update", input, ROOT, PAGE)).toBe(input);
    expect(retargetAgentRootAdd("weave.item.add", null, ROOT, PAGE)).toBe(null);
    expect(retargetAgentRootAdd("weave.item.add", "x", ROOT, PAGE)).toBe("x");
  });

  it("preserves the rest of the input untouched on rewrite", () => {
    const out = retargetAgentRootAdd(
      "weave.item.add",
      { kind: "text", frame: { x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 0 } },
      ROOT,
      PAGE,
    ) as Record<string, unknown>;
    expect(out.frame).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 0 });
    expect(out.containerId).toBe(PAGE);
  });
});
