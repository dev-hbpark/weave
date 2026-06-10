// WI-168 / DR-115 — page-bounded agent-surface adapter units: input
// translation (intoActivePage / page.add stamping / reparent / batch inner-op
// rewrite), schema overlays, and the prompt fragment. Pure functions — no
// React, no document.

import type { AgentCommandSpec } from "@agocraft/agent-client";
import { describe, expect, it } from "vitest";
import { FULL_FRAME } from "../../types.js";
import type { AgentHostContext, AgentToolAdapter } from "../types.js";
import { intoActivePage, PAGE_AGENT_SURFACE, pagePromptFragment } from "./agent-surface.js";

const HOST: AgentHostContext = { rootId: "root-1", activeContainerId: "page-1" };
const NO_PAGE: AgentHostContext = { rootId: "root-1", activeContainerId: undefined };

function adapterFor(exposedName: string): AgentToolAdapter {
  const tools = PAGE_AGENT_SURFACE.tools;
  if (tools === "all") throw new Error("PAGE surface must be an explicit allow-list");
  const found = tools.find((t) => typeof t !== "string" && t.exposedName === exposedName);
  if (found === undefined || typeof found === "string") {
    throw new Error(`no adapter exposed as ${exposedName}`);
  }
  return found;
}

/** Minimal item.add-shaped base spec for schema-overlay tests. */
const ITEM_ADD_BASE: AgentCommandSpec = {
  label: "아이템 추가",
  inputSchema: {
    type: "object",
    description: "base description",
    properties: {
      kind: { type: "string" },
      containerId: { type: "string" },
      frame: { type: "object" },
      attrsOverride: { type: "object" },
      units: { type: "array" },
    },
    required: ["kind"],
  },
};

describe("intoActivePage (WI-168)", () => {
  it("targets the active page when containerId is omitted", () => {
    expect(intoActivePage({ kind: "text" }, HOST)).toEqual({
      kind: "text",
      containerId: "page-1",
    });
  });

  it("retargets an explicit ROOT containerId onto the active page", () => {
    expect(intoActivePage({ kind: "shape", containerId: "root-1" }, HOST)).toEqual({
      kind: "shape",
      containerId: "page-1",
    });
  });

  it("retargets frame adds too — pages are created via weave.page.add only", () => {
    expect(intoActivePage({ kind: "frame" }, HOST)).toEqual({
      kind: "frame",
      containerId: "page-1",
    });
  });

  it("respects an explicit non-root container (a frame inside the page)", () => {
    const input = { kind: "text", containerId: "inner-frame" };
    expect(intoActivePage(input, HOST)).toBe(input);
  });

  it("degenerate host (no active page) leaves the input unchanged", () => {
    const input = { kind: "text" };
    expect(intoActivePage(input, NO_PAGE)).toBe(input);
  });

  it("non-object input passes through", () => {
    expect(intoActivePage(undefined, HOST)).toBeUndefined();
    expect(intoActivePage("nope", HOST)).toBe("nope");
  });
});

describe("weave.page.add adapter", () => {
  const pageAdd = adapterFor("weave.page.add");

  it("stamps the rail-'+' shape: kind frame, root container, FULL_FRAME", () => {
    expect(pageAdd.mapInput?.({}, HOST)).toEqual({
      kind: "frame",
      containerId: "root-1",
      frame: FULL_FRAME,
    });
  });

  it("keeps a deliberate non-standard frame and styling passthroughs", () => {
    const frame = { x: 0, y: 0, width: 0.5, height: 0.5, rotation: 0 };
    expect(pageAdd.mapInput?.({ frame, attrsOverride: { name: "p" } }, HOST)).toEqual({
      kind: "frame",
      containerId: "root-1",
      frame,
      attrsOverride: { name: "p" },
    });
  });

  it("agent cannot override kind/containerId (stamped after the spread)", () => {
    const out = pageAdd.mapInput?.({ kind: "text", containerId: "page-1" }, HOST) as Record<
      string,
      unknown
    >;
    expect(out["kind"]).toBe("frame");
    expect(out["containerId"]).toBe("root-1");
  });

  it("schema drops kind/containerId and keeps frame/attrsOverride/units by reference", () => {
    const spec = pageAdd.schema?.(ITEM_ADD_BASE);
    const props = (spec?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props).sort()).toEqual(["attrsOverride", "frame", "units"]);
    expect((spec?.inputSchema as { required?: unknown }).required).toEqual([]);
  });

  it("schema loud-fails without a base spec (catalogue drift)", () => {
    expect(() => pageAdd.schema?.(undefined)).toThrow(/no base schema/);
  });
});

describe("weave.item.reparent adapter", () => {
  const reparent = adapterFor("weave.item.reparent");

  it("resolves root newParentId entries onto the active page, leaving others", () => {
    expect(
      reparent.mapInput?.(
        {
          entries: [
            { itemId: "a", newParentId: "root-1" },
            { itemId: "b", newParentId: "page-2" },
          ],
        },
        HOST,
      ),
    ).toEqual({
      entries: [
        { itemId: "a", newParentId: "page-1" },
        { itemId: "b", newParentId: "page-2" },
      ],
    });
  });

  it("no root entries → input unchanged (same reference)", () => {
    const input = { entries: [{ itemId: "a", newParentId: "page-2" }] };
    expect(reparent.mapInput?.(input, HOST)).toBe(input);
  });

  it("degenerate host → unchanged", () => {
    const input = { entries: [{ itemId: "a", newParentId: "root-1" }] };
    expect(reparent.mapInput?.(input, NO_PAGE)).toBe(input);
  });
});

describe("weave.batch adapter (inner-op translation)", () => {
  const batch = adapterFor("weave.batch");

  it("rewrites weave.page.add ops to the internal command and retargets inner adds", () => {
    expect(
      batch.mapInput?.(
        {
          ops: [
            { command: "weave.page.add", input: {} },
            { command: "weave.item.add", input: { kind: "text" } },
            { command: "weave.item.update", input: { itemId: "x" } },
          ],
        },
        HOST,
      ),
    ).toEqual({
      ops: [
        {
          command: "weave.item.add",
          input: { kind: "frame", containerId: "root-1", frame: FULL_FRAME },
        },
        { command: "weave.item.add", input: { kind: "text", containerId: "page-1" } },
        { command: "weave.item.update", input: { itemId: "x" } },
      ],
    });
  });

  it("no adapted ops → input unchanged (same reference)", () => {
    const input = { ops: [{ command: "weave.item.remove", input: { itemId: "x" } }] };
    expect(batch.mapInput?.(input, HOST)).toBe(input);
  });
});

describe("pagePromptFragment", () => {
  it("anchors the live active page and points page creation at weave.page.add", () => {
    const line = pagePromptFragment(HOST);
    expect(line).toContain("page-1");
    expect(line).toContain("weave.page.add");
    // The absorbed teaching line is GONE — the tool carries the model now.
    expect(line).not.toContain("최상위 frame");
  });

  it("degenerate host (empty deck) still routes to weave.page.add", () => {
    expect(pagePromptFragment(NO_PAGE)).toContain("weave.page.add");
  });
});
