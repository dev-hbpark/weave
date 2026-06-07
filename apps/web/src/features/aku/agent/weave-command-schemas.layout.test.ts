// WI-133 — drift guard: every CSS layout feature the engine gained (WI-132 /
// agocraft DR-047) must be advertised to the Aku agent. The agent server
// receives exactly these objects: `connectAgocraftAgent` registers each
// command's `inputSchema` (applyCommandSchemas → describeCommands → the bridge
// tool descriptor) and forwards `WEAVE_CAPABILITIES` via the capabilities tool.
// So asserting the inputSchema JSON + the layoutKinds prose here is asserting
// what reaches the model. Fails if a new spec field ships without grounding,
// or if a stale "not supported" note resurfaces.

import { describe, expect, it } from "vitest";
import { WEAVE_CAPABILITIES } from "./weave-capabilities.js";
import { WEAVE_COMMAND_SCHEMAS } from "./weave-command-schemas.js";

/** The exact inputSchema object the bridge registers + ships for a command. */
function schemaText(command: string): string {
  const spec = WEAVE_COMMAND_SCHEMAS[command];
  expect(spec, `no schema for ${command}`).toBeDefined();
  return JSON.stringify(spec?.inputSchema ?? {});
}

function layoutKindText(kind: string): string {
  const lk = WEAVE_CAPABILITIES.layoutKinds.find((k) => k.kind === kind) as
    | { description?: string; childConstraints?: string }
    | undefined;
  expect(lk, `no capability layoutKind ${kind}`).toBeDefined();
  return `${lk?.description ?? ""} ${lk?.childConstraints ?? ""}`;
}

describe("layout feature grounding reaches the agent (WI-133)", () => {
  it("weave.frame.setLayout inputSchema advertises every new flex + grid field", () => {
    const s = schemaText("weave.frame.setLayout");
    for (const term of [
      // flex
      "space-evenly",
      "baseline",
      "wrap",
      "alignContent",
      // grid
      "minmax",
      "columnsRepeat",
      "rowsRepeat",
      "auto-fill",
      "auto-fit",
      "autoFlow",
      "dense",
      "areas",
    ]) {
      expect(s, `setLayout schema must mention "${term}"`).toContain(term);
    }
  });

  it("weave.item.setLayoutChild inputSchema advertises grid `area` + baseline alignSelf", () => {
    const s = schemaText("weave.item.setLayoutChild");
    expect(s).toContain("area");
    expect(s).toContain("baseline");
  });

  it("auto-flex capability prose teaches wrap / alignContent / space-evenly", () => {
    const t = layoutKindText("auto-flex");
    for (const term of ["wrap", "alignContent", "space-evenly", "space-between"]) {
      expect(t, `auto-flex capability must teach "${term}"`).toContain(term);
    }
  });

  it("auto-grid capability prose teaches minmax / auto-fill / dense / areas", () => {
    const t = layoutKindText("auto-grid");
    for (const term of ["minmax", "auto-fill", "auto-fit", "dense", "areas"]) {
      expect(t, `auto-grid capability must teach "${term}"`).toContain(term);
    }
  });

  it("no stale 'not supported in v1.1' notes survive anywhere in the layout grounding", () => {
    const all = [
      schemaText("weave.frame.setLayout"),
      schemaText("weave.item.setLayoutChild"),
      layoutKindText("auto-flex"),
      layoutKindText("auto-grid"),
    ].join(" ");
    // The exclusions that DR-047 reversed must not be advertised as missing.
    // Precise stale phrases (not greedy — "do NOT fake a table … minmax" is fine).
    expect(all).not.toMatch(/\bno wrap\b/i);
    expect(all).not.toMatch(/\bno auto-fill\b/i);
    expect(all).not.toMatch(/\bno minmax\b/i);
    expect(all).not.toMatch(/\bv1\.1\b/i);
  });
});
