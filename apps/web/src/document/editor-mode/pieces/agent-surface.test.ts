// WI-168 / DR-115 — page-bounded agent-surface adapter units: input
// translation (intoActivePage / page.add stamping / reparent / batch inner-op
// rewrite), schema overlays, and the prompt fragment. Pure functions — no
// React, no document.

import type { AgentCommandSpec } from "@agocraft/agent-client";
import { describe, expect, it } from "vitest";
import type { AgentHostContext, AgentToolAdapter } from "../types.js";
import {
  intoActivePage,
  intoActivePageClamped,
  PAGE_AGENT_SURFACE,
  pagePromptFragment,
} from "./agent-surface.js";

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

describe("intoActivePageClamped (WI-169 — add-time soft clamp)", () => {
  it("pulls an off-page frame back to the min-overlap band (clip-invisible add is unrepresentable)", () => {
    const out = intoActivePageClamped(
      { kind: "shape", frame: { x: 1.2, y: -2, width: 0.4, height: 0.3, rotation: 0 } },
      HOST,
    ) as { containerId: string; frame: { x: number; y: number; width: number } };
    expect(out.containerId).toBe("page-1");
    // clampAxis: [m - size, 1 - m] with m = 0.05 → x ∈ [-0.35, 0.95], y ∈ [-0.25, 0.95]
    expect(out.frame.x).toBeCloseTo(0.95);
    expect(out.frame.y).toBeCloseTo(-0.25);
    expect(out.frame.width).toBe(0.4); // size untouched — position-only clamp (D6 parity)
  });

  it("an in-band frame passes through by reference (no needless copy)", () => {
    const retargeted = intoActivePageClamped(
      { kind: "shape", frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 } },
      HOST,
    );
    expect(retargeted).toEqual({
      kind: "shape",
      containerId: "page-1",
      frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
    });
  });

  it("a frameless add (auto-layout container path) is only retargeted", () => {
    expect(intoActivePageClamped({ kind: "text" }, HOST)).toEqual({
      kind: "text",
      containerId: "page-1",
    });
  });

  it("an explicit non-active container is left alone — inner-frame geometry is unknown to a pure mapInput", () => {
    const input = {
      kind: "shape",
      containerId: "inner-frame",
      frame: { x: 5, y: 5, width: 0.4, height: 0.4, rotation: 0 },
    };
    expect(intoActivePageClamped(input, HOST)).toBe(input);
  });

  it("malformed frame numbers pass through unclamped (command validation owns them)", () => {
    const out = intoActivePageClamped(
      { kind: "shape", frame: { x: Number.NaN, y: 0, width: 0.4, height: 0.4 } },
      HOST,
    ) as { frame: { x: number } };
    expect(Number.isNaN(out.frame.x)).toBe(true);
  });

  it("degenerate host → unchanged", () => {
    const input = { kind: "shape", frame: { x: 5, y: 5, width: 0.4, height: 0.4 } };
    expect(intoActivePageClamped(input, NO_PAGE)).toBe(input);
  });
});

describe("weave.page.add adapter", () => {
  const pageAdd = adapterFor("weave.page.add");

  it("WI-184 ⑩ — wraps the REAL weave.page.add command (FULL_FRAME lock + order insert live in the command, not here)", () => {
    expect(pageAdd.command).toBe("weave.page.add");
  });

  it("stamps afterId from the active page — the new slide lands right after the current one", () => {
    expect(pageAdd.mapInput?.({}, HOST)).toEqual({ afterId: "page-1" });
    expect(pageAdd.mapInput?.({ attrsOverride: { name: "p" } }, HOST)).toEqual({
      afterId: "page-1",
      attrsOverride: { name: "p" },
    });
  });

  it("agent cannot override afterId (stamped after the spread)", () => {
    const out = pageAdd.mapInput?.({ afterId: "page-2" }, HOST) as Record<string, unknown>;
    expect(out["afterId"]).toBe("page-1");
  });

  it("degenerate host (no active page) → afterId undefined (command appends at the deck end)", () => {
    const out = pageAdd.mapInput?.({}, NO_PAGE) as Record<string, unknown>;
    expect(out["afterId"]).toBeUndefined();
  });

  it("schema drops afterId and keeps attrsOverride/units by reference (insert position is not agent-addressable)", () => {
    const spec = pageAdd.schema?.(ITEM_ADD_BASE);
    const props = (spec?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props).sort()).toEqual(["attrsOverride", "units"]);
    expect((spec?.inputSchema as { required?: unknown }).required).toEqual([]);
  });

  it("activates the page it creates (rail-'+' parity — the façade fires onPageActivate)", () => {
    expect(pageAdd.activatesPage).toBe(true);
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

  it("stamps weave.page.add ops' afterId and retargets inner adds", () => {
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
        { command: "weave.page.add", input: { afterId: "page-1" } },
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

describe("weave.page.duplicate adapter (WI-169)", () => {
  const pageDuplicate = adapterFor("weave.page.duplicate");

  it("wraps the internal command 1:1 and activates the clone (rail onDuplicatePage parity)", () => {
    expect(pageDuplicate.command).toBe("weave.page.duplicate");
    expect(pageDuplicate.activatesPage).toBe(true);
    expect(pageDuplicate.mapInput).toBeUndefined();
  });
});

describe("page-surface composition (WI-169)", () => {
  const tools = PAGE_AGENT_SURFACE.tools;
  if (tools === "all") throw new Error("PAGE surface must be an explicit allow-list");
  const exposed = tools.map((t) => (typeof t === "string" ? t : t.exposedName));

  it("weave.preset.insertSlide is NOT exposed — page creation has one path (weave.page.add)", () => {
    expect(exposed).not.toContain("weave.preset.insertSlide");
  });

  it("weave.page.duplicate stays exposed (moved from pass-through to adapter)", () => {
    expect(exposed).toContain("weave.page.duplicate");
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

  it("WI-170: carries the default-new-page judgment rule on the active branch", () => {
    const line = pagePromptFragment(HOST);
    expect(line).toContain("기본 판단 규칙");
    // New-content requests not targeting existing items default to a NEW page…
    expect(line).toContain("새 페이지");
    // …with the empty-active-page escape (use it as-is) and the no-overlap clause.
    expect(line).toContain("비어 있으면");
    expect(line).toContain("겹쳐 추가하지 마세요");
  });

  it("WI-170: the empty-deck branch stays rule-free (page.add is already the only path)", () => {
    expect(pagePromptFragment(NO_PAGE)).not.toContain("기본 판단 규칙");
  });
});
