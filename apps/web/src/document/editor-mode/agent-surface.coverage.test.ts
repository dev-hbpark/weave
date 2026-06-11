// WI-168 / DR-115 — page-bounded agent-surface EXHAUSTIVENESS guard. The PAGE
// surface is a CLOSED allow-list: this suite fails when a newly-registered
// command was never triaged for it (enlist OR deliberately exclude — omission
// at the policy level fails safe as "not exposed", but an UNTRIAGED omission
// is the WI-167 recurrence class this surface exists to remove). It also locks
// the structural invariants: every enlisted internal command is actually
// registered, every adapter resolves a schema against the catalogue, and
// exposed names stay unique.
//
// Lives INSIDE the editor-mode module: it imports `pieces/` directly, which
// Rule 1 of tools/check_editor_mode_boundary.sh forbids outside the module.

import { describe, expect, it } from "vitest";
import { WEAVE_COMMAND_SCHEMAS } from "../../features/aku/agent/weave-command-schemas.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "../commands.js";
import { defaultPresetRegistry } from "../presets/default-registry.js";
import { FREE_AGENT_SURFACE, PAGE_AGENT_SURFACE } from "./pieces/agent-surface.js";
import type { AgentToolAdapter } from "./types.js";

const noopTargets: WeaveCommandTargets = {
  reset: () => {},
};

const REGISTERED = buildWeaveCommands(noopTargets, defaultPresetRegistry()).map((c) => c.name);

/** Registered commands DELIBERATELY not exposed on the page-bounded surface.
 *  Adding a name here is the explicit triage decision — with a reason. */
const PAGE_EXCLUDED: ReadonlyArray<string> = [
  // WI-169 — preset slide roots are MIXED-CANVAS boxes ({x:0.3, y:0.3,
  // 0.4×0.4} at the design root): on a page-bounded format that lands a
  // "page" at an offset, breaking the FULL_FRAME stacking model. Its label
  // ("슬라이드 추가") also out-competes weave.page.add for "new slide"
  // intents. Page creation has exactly ONE agent path: weave.page.add.
  "weave.preset.insertSlide",
  // WI-183 — offset-0 clone backing the UI's Alt+drag duplicate gesture. On a
  // page-bounded surface a perfect-overlap copy is invisible (and a page-id
  // input would mean two stacked pages); the agent paths stay
  // weave.items.duplicate (offset) and weave.page.duplicate (rail parity).
  "weave.items.duplicateInPlace",
];

function asAdapters(tools: typeof PAGE_AGENT_SURFACE.tools): ReadonlyArray<AgentToolAdapter> {
  if (tools === "all") throw new Error("expected an explicit allow-list");
  return tools.map((t) => (typeof t === "string" ? { exposedName: t, command: t } : t));
}

describe("page-bounded agent surface coverage (WI-168 / DR-115)", () => {
  const tools = asAdapters(PAGE_AGENT_SURFACE.tools);

  it("free-placement flavors pass the whole registry through (DR-064 unchanged)", () => {
    expect(FREE_AGENT_SURFACE.tools).toBe("all");
  });

  it("every enlisted tool wraps a REGISTERED internal command", () => {
    const unknown = tools.map((t) => t.command).filter((c) => !REGISTERED.includes(c));
    expect(unknown, `tools wrapping unregistered commands: ${unknown.join(", ")}`).toEqual([]);
  });

  it("every REGISTERED command is triaged: enlisted or deliberately excluded", () => {
    const enlisted = new Set(tools.map((t) => t.command));
    const untriaged = REGISTERED.filter((n) => !enlisted.has(n) && !PAGE_EXCLUDED.includes(n));
    expect(
      untriaged,
      `new registered commands never triaged for the page surface ` +
        `(enlist in PAGE_AGENT_SURFACE or exclude here with a reason): ${untriaged.join(", ")}`,
    ).toEqual([]);
  });

  it("excluded commands are not ALSO enlisted (one decision per command)", () => {
    const enlisted = new Set(tools.map((t) => t.command));
    expect(PAGE_EXCLUDED.filter((n) => enlisted.has(n))).toEqual([]);
  });

  it("exposed names are unique", () => {
    const names = tools.map((t) => t.exposedName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("weave.page.add is the wrapped page-creation tool over weave.item.add", () => {
    const pageAdd = tools.find((t) => t.exposedName === "weave.page.add");
    expect(pageAdd?.command).toBe("weave.item.add");
  });

  it("every tool resolves a schema against the catalogue (the façade's loud-fail holds)", () => {
    for (const tool of tools) {
      const base = WEAVE_COMMAND_SCHEMAS[tool.command];
      const spec = tool.schema !== undefined ? tool.schema(base) : base;
      expect(spec, tool.exposedName).toBeDefined();
      const description = (spec?.inputSchema as { description?: unknown }).description;
      expect(typeof description, `${tool.exposedName} inputSchema.description`).toBe("string");
    }
  });
});
