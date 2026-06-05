// Drift guard for the kit commands re-exposed via retargetCommandSchemas (DR-039 /
// HANDOFF-009). These weave.* commands carry their argument contract BY IMPORT from
// @agocraft/agent-client's AGENT_COMMAND_SCHEMAS — not by hand-copy. This suite fails
// if a retargeted command stops resolving or loses its expected shape, turning an
// upstream kit-contract change into a build break instead of silent drift.

import { AGENT_COMMAND_SCHEMAS } from "@agocraft/agent-client";
import { describe, expect, it } from "vitest";
import { WEAVE_COMMAND_LABELS, WEAVE_COMMAND_SCHEMAS } from "./weave-command-schemas.js";

const RETARGETED: ReadonlyArray<readonly [weaveName: string, kitName: string]> = [
  ["weave.item.remove", "item.remove"],
  ["weave.item.reparent", "item.reparent"],
  ["weave.clipboard.copy", "clipboard.copy"],
  ["weave.clipboard.cut", "clipboard.cut"],
  ["weave.item.duplicate", "item.duplicate"],
];

describe("agent schemas — retargeted kit commands (DR-039)", () => {
  it("every retargeted weave.* command resolves against the vendored kit", () => {
    for (const [weaveName, kitName] of RETARGETED) {
      expect(WEAVE_COMMAND_SCHEMAS[weaveName], weaveName).toBeDefined();
      // the kit source still has the canonical key — if this fails, the kit renamed
      // or removed it and the retarget `only` list must be updated.
      expect(AGENT_COMMAND_SCHEMAS[kitName], kitName).toBeDefined();
    }
  });

  it("carries the kit inputSchema by import — argument SHAPE verbatim, + a weave description (WI-095)", () => {
    for (const [weaveName, kitName] of RETARGETED) {
      const weaveSchema = {
        ...(WEAVE_COMMAND_SCHEMAS[weaveName]?.inputSchema as object),
      } as Record<string, unknown>;
      // WI-095/DR-064 — withKitDesc adds a top-level `description` (the only
      // per-command text the agent sees). The ARGUMENT SHAPE is still the kit's by
      // import: strip the weave description, then assert the rest is verbatim.
      expect(typeof weaveSchema.description, weaveName).toBe("string");
      delete weaveSchema.description;
      expect(weaveSchema, weaveName).toEqual(AGENT_COMMAND_SCHEMAS[kitName]?.inputSchema);
    }
  });

  it("preserves the kit's destructive classification", () => {
    expect(WEAVE_COMMAND_SCHEMAS["weave.item.remove"]?.destructive).toBe(true);
    expect(WEAVE_COMMAND_SCHEMAS["weave.clipboard.cut"]?.destructive).toBe(true);
    expect(WEAVE_COMMAND_SCHEMAS["weave.item.duplicate"]?.destructive).toBeUndefined();
    expect(WEAVE_COMMAND_SCHEMAS["weave.clipboard.copy"]?.destructive).toBeUndefined();
    expect(WEAVE_COMMAND_SCHEMAS["weave.item.reparent"]?.destructive).toBeUndefined();
  });

  it("uses the weave-owned label, not the kit's English label", () => {
    for (const [weaveName] of RETARGETED) {
      expect(WEAVE_COMMAND_SCHEMAS[weaveName]?.label, weaveName).toBe(
        WEAVE_COMMAND_LABELS[weaveName],
      );
    }
    // sanity: the label really is weave's Korean verb, not the kit default
    expect(WEAVE_COMMAND_SCHEMAS["weave.item.remove"]?.label).toBe("아이템 삭제");
  });
});
