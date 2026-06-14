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

  // WI-222 — the schema must be STRUCTURED (typed properties), not just prose in a
  // description over an open object. A bare `additionalProperties:true` gives the
  // model no scaffold and it malforms the nested grid/flex detail objects.
  it("WI-222: setLayout `layout` schema declares typed properties + nested sub-schemas", () => {
    const input = WEAVE_COMMAND_SCHEMAS["weave.frame.setLayout"]?.inputSchema as {
      properties?: { layout?: Record<string, never> };
    };
    const layout = input?.properties?.layout as
      | {
          properties?: Record<string, { items?: { properties?: { kind?: { enum?: string[] } } } }>;
        }
      | undefined;
    expect(
      layout?.properties,
      "layout must declare typed properties, not prose-only",
    ).toBeDefined();
    for (const p of [
      "kind",
      "direction",
      "gap",
      "justify",
      "align",
      "padding",
      "columns",
      "rows",
      "columnGap",
      "rowGap",
      "columnsRepeat",
      "rowsRepeat",
      "autoFlow",
      "dense",
      "areas",
    ]) {
      expect(layout?.properties?.[p], `layout.properties must include "${p}"`).toBeDefined();
    }
    // columns items resolve to a TrackSize whose `kind` enum includes minmax.
    const trackKindEnum = layout?.properties?.columns?.items?.properties?.kind?.enum;
    expect(trackKindEnum, "columns.items is a typed TrackSize").toContain("minmax");
    // padding is a typed 4-side object.
    const padding = layout?.properties?.padding as { properties?: Record<string, unknown> };
    expect(padding?.properties?.top, "padding is a typed 4-side object").toBeDefined();
  });

  it("WI-222: setLayoutChild `policy` schema declares typed properties", () => {
    const input = WEAVE_COMMAND_SCHEMAS["weave.item.setLayoutChild"]?.inputSchema as {
      properties?: { policy?: { properties?: Record<string, unknown> } };
    };
    const policy = input?.properties?.policy;
    expect(policy?.properties, "policy must declare typed properties").toBeDefined();
    for (const p of [
      "kind",
      "grow",
      "shrink",
      "basis",
      "alignSelf",
      "column",
      "row",
      "columnSpan",
      "rowSpan",
      "justifySelf",
      "area",
    ]) {
      expect(policy?.properties?.[p], `policy.properties must include "${p}"`).toBeDefined();
    }
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
