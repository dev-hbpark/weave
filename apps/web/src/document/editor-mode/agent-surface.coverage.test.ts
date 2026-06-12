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
  // WI-184 ⑨ — rail multi-select SET duplicate. The page surface's
  // page-creation adapters ride the activatesPage rail-parity channel
  // (WI-169), which needs exactly ONE new page id to activate; a set return
  // has no single activation target. The agent's page-copy path stays
  // weave.page.duplicate (one page per call, each activating its clone).
  "weave.pages.duplicate",
  // WI-185 ⑭ — Cmd+G group (wrap siblings in a frame). PAGES are root
  // siblings, so an agent passing page ids would wrap pages in a root frame
  // and hijack the deck (the new root frame joins presentationOrder while
  // the pages vanish from it). mapInput is pure (WI-168 residual limit) and
  // the command's mixed-parents guard can't tell pages from content, so the
  // page surface defers this until a doc-aware adapter can refuse page ids.
  // The UI gesture (Cmd+G) is unaffected — it filters by capability first.
  "weave.items.group",

  // ── WI-205 / DR-130 — agent tool-surface reduction ───────────────────────
  // The advertised schemas re-read every turn dominate agent input tokens
  // (small-think DR-067). These 19 commands were de-listed from the AGENT
  // surface to match the canonical funnel weave-capabilities §6 already teaches.
  // ALL stay registered for the UI — only the agent no longer SEES them, and
  // every verb is reachable through a kept canonical tool.
  //
  // (a) Non-canonical single-item style mutators — the domain prose explicitly
  //     says these "do not exist; everything they did is via weave.item.add /
  //     weave.item.update" (units). De-listing makes that statement TRUE.
  "weave.shape.setFill", // → weave.item.update units:[{ kind:"decoration.fill" }]
  "weave.shape.setCornerRadius", // → weave.item.update attrs.cornerRadius / cornerRadii
  "weave.shape.setVertices", // → weave.item.update attrs (poly points)
  "weave.item.setDecoration", // → weave.item.add / weave.item.update units
  // (b) Non-canonical MULTI-item mutators — the prose says "do NOT use items.
  //     align / resizeMulti / remove / duplicate — folded into items.update /
  //     items.lifecycle". De-listing aligns the surface with that funnel.
  "weave.items.resizeMulti", // → weave.items.update (per-item frames in `updates`)
  "weave.items.remove", // → weave.items.lifecycle { op:"remove" }
  "weave.items.duplicate", // → weave.items.lifecycle { op:"duplicate" }
  "weave.items.duplicateWithDelta", // niche rhythmic clone → items.lifecycle + items.update frames
  // (c) Niche shape/line/image ops — ~0 agent usage; canonical paths cover the
  //     common case, fail-closed is acceptable for the rare one.
  "weave.image.setCrop", // → weave.item.update attrs.cropRatio
  "weave.item.flip", // → weave.item.update units:[{ kind:"transform.flip" }]
  "weave.shape.breakToLine", // shape→line conversion, rare on slides
  "weave.line.closeToShape", // line→shape conversion, rare on slides
  // (d) Relative z-order ±1 steps — to/Front / to/Back cover the agent intent.
  "weave.item.bringForward",
  "weave.item.sendBackward",
  // (e) Grid/flex micro-ops — placement is owned by weave.item.setLayoutChild /
  //     weave.frame.setLayout / weave.design.reorderChildren.
  "weave.item.swapGridCells",
  "weave.item.dropGridCell",
  "weave.item.swapFlexOrder",
  // (f) Frame dissolve — niche AND destructive on a page (a page IS a frame:
  //     dissolving the active page spills its children to the root). The UI
  //     keeps it; the agent should not reach for it blind.
  "weave.frame.removeKeepingChildren",
  // (g) Whole-document reset — a footgun to hand an agent, not a slide-editing
  //     capability. UI-only.
  "weave.doc.reset",
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

  it("weave.page.add wraps the real page-add command (WI-184 ⑩ — was an alias over weave.item.add)", () => {
    const pageAdd = tools.find((t) => t.exposedName === "weave.page.add");
    expect(pageAdd?.command).toBe("weave.page.add");
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
