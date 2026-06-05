// WI-099 — attr coverage guard. Every attr a kind actually SEEDS (domain-kinds
// defaultAttrs) must be advertised to the agent in that kind's capability
// `editableAttrs`, so no editable attribute is silently missing from the agent's
// grounding (the operator's "모든 attr이 빠짐없이 전달되는지" audit, made permanent).

import { describe, expect, it } from "vitest";
import { defaultAttrsFor, KNOWN_DOMAIN_KINDS } from "../../../document/domain-kinds.js";
import type { DomainKind } from "../../../document/types.js";
import { WEAVE_CAPABILITIES } from "./weave-capabilities.js";

// Attrs intentionally NOT advertised per-kind, with the reason:
//  - locked: UNIVERSAL (every kind); documented once in WEAVE_DOMAIN_KNOWLEDGE rule 6.
//  - legacy text aliases superseded by the canonical field the guidance teaches.
const SKIP: ReadonlySet<string> = new Set([
  "locked", // universal — documented in domain knowledge, not per-kind
  "textAlign", // legacy → textAlignHorizontal
  "lineHeight", // legacy → lineHeightSpec
  "textTruncation", // not surfaced (auto-height model owns overflow via textOverflow)
  "maxLines", // not surfaced
]);

const KINDS = [...KNOWN_DOMAIN_KINDS] as DomainKind[];

describe("capabilities attr coverage (WI-099)", () => {
  it("every known domain kind has a capability itemKind", () => {
    const advertised = new Set(WEAVE_CAPABILITIES.itemKinds.map((k) => k.kind));
    const missing = KINDS.filter((k) => !advertised.has(k));
    expect(missing, `kinds with no capability itemKind: ${missing.join(", ")}`).toEqual([]);
  });

  for (const kind of KINDS) {
    it(`${kind}: every seeded attr is in editableAttrs (or an explicit skip)`, () => {
      const cap = WEAVE_CAPABILITIES.itemKinds.find((k) => k.kind === kind);
      const editable = new Set<string>(cap?.editableAttrs ?? []);
      const seeded = Object.keys(defaultAttrsFor(kind) as unknown as Record<string, unknown>);
      const missing = seeded.filter((a) => !editable.has(a) && !SKIP.has(a));
      expect(missing, `${kind} attrs missing from editableAttrs: ${missing.join(", ")}`).toEqual(
        [],
      );
    });
  }
});
