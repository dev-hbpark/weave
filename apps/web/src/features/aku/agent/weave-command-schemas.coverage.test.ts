// WI-095 / DR-064 — agent command COVERAGE guard. The agent is given the FULL
// weave command registry (nothing hidden), and every advertised command must
// carry a curated argument schema in WEAVE_COMMAND_SCHEMAS. This suite fails if
// (a) a newly-registered command ships without a schema, or (b) a previously
// hidden command silently loses its schema again — locking the "all public"
// decision against drift.

import { describe, expect, it } from "vitest";
import { buildWeaveCommands, type WeaveCommandTargets } from "../../../document/commands.js";
import { defaultPresetRegistry } from "../../../document/presets/default-registry.js";
import { WEAVE_COMMAND_SCHEMAS } from "./weave-command-schemas.js";

const noopTargets: WeaveCommandTargets = {
  reset: () => {},
};

// Every command the editor registers = every tool the agent is offered (the
// reverse-MCP bridge advertises the registry's list() verbatim — no filter).
const REGISTERED = buildWeaveCommands(noopTargets, defaultPresetRegistry()).map((c) => c.name);

// The set that DR-064 un-hid (was filtered out of the agent before WI-095).
const PREVIOUSLY_HIDDEN: ReadonlyArray<string> = [
  "weave.shape.setFill",
  "weave.shape.setCornerRadius",
  "weave.shape.setVertices",
  "weave.item.setDecoration",
  "weave.image.setCrop",
  "weave.item.flip",
  "weave.items.resizeMulti",
  "weave.items.remove",
  "weave.items.duplicate",
  "weave.doc.reset",
  "weave.preset.insertSlide",
];

describe("agent command coverage (WI-095 / DR-064)", () => {
  it("registers a non-trivial command set", () => {
    expect(REGISTERED.length).toBeGreaterThan(30);
  });

  it("every registered command has a curated agent schema (no hidden commands)", () => {
    const missing = REGISTERED.filter((n) => WEAVE_COMMAND_SCHEMAS[n] === undefined);
    expect(missing, `commands missing a schema: ${missing.join(", ")}`).toEqual([]);
  });

  it("the previously-hidden commands are now all exposed", () => {
    for (const name of PREVIOUSLY_HIDDEN) {
      expect(REGISTERED, name).toContain(name);
      expect(WEAVE_COMMAND_SCHEMAS[name], name).toBeDefined();
    }
  });

  it("every command carries a top-level inputSchema.description (the only per-command text the agent gets)", () => {
    const missing = Object.entries(WEAVE_COMMAND_SCHEMAS)
      .filter(([, spec]) => {
        const d = (spec.inputSchema as { description?: unknown }).description;
        return typeof d !== "string" || d.length === 0;
      })
      .map(([name]) => name);
    expect(missing, `commands missing inputSchema.description: ${missing.join(", ")}`).toEqual([]);
  });

  it("the preset command advertises a closed presetId enum (no more guessed ids)", () => {
    const schema = WEAVE_COMMAND_SCHEMAS["weave.preset.insertSlide"];
    const props = (schema?.inputSchema as { properties?: Record<string, { enum?: unknown[] }> })
      ?.properties;
    expect(props?.presetId?.enum?.length).toBe(25);
  });

  // WI-140 — every kind the agent can CREATE via weave.item.add must be
  // discoverable on that command: its attrsOverride bag carries a "For <kind>
  // items" note AND the command prose lists it. The WI-099 capability test guards
  // SEEDED attrs → editableAttrs, but NOT these command-schema notes — so a new
  // kind (qr's logo, embed) could be mechanically creatable (open attrs bag) yet
  // invisible in the command's own guidance. This guard closes that gap.
  it("every creatable item.add kind has a note in the attrs bag AND in the command prose", () => {
    const add = WEAVE_COMMAND_SCHEMAS["weave.item.add"];
    const input = add?.inputSchema as {
      description?: string;
      properties?: {
        kind?: { enum?: string[] };
        attrsOverride?: { description?: string };
      };
    };
    const kinds = input?.properties?.kind?.enum ?? [];
    const attrsDesc = input?.properties?.attrsOverride?.description ?? "";
    const prose = input?.description ?? "";

    expect(kinds.length).toBeGreaterThan(0);
    const missingNote = kinds.filter((k) => !attrsDesc.includes(`For ${k} items`));
    expect(
      missingNote,
      `kinds missing a "For <kind> items" attrs note: ${missingNote.join(", ")}`,
    ).toEqual([]);
    const missingProse = kinds.filter((k) => !prose.includes(k));
    expect(missingProse, `kinds not listed in item.add prose: ${missingProse.join(", ")}`).toEqual(
      [],
    );
  });
});
