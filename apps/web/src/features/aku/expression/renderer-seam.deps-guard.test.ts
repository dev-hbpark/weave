// WI-103 / DR-070 D2 — renderer-seam purity guard.
//
// The expression CONSUMER layer (mood registry, phrase registry, subscribe hook,
// renderer interface) must depend ONLY on the AkuExpressionRenderer interface —
// never on a concrete renderer (css-sprite-renderer). That keeps a future
// createRiveRenderer a drop-in with zero change to these files (Protected
// Variations). The composition root (AkuAssistant) is the ONLY place allowed to
// import a concrete renderer. Same file-local-guard rationale as the useAkuAgent
// stale-closure guard (DR-030).

import { describe, expect, it } from "vitest";
import moodSrc from "./mood.ts?raw";
import phrasesSrc from "./phrases.ts?raw";
import rendererTypesSrc from "./renderer-types.ts?raw";
import useExpressionSrc from "./use-aku-expression.ts?raw";

const CONSUMER_SOURCES: ReadonlyArray<readonly [name: string, src: string]> = [
  ["mood.ts", moodSrc],
  ["phrases.ts", phrasesSrc],
  ["renderer-types.ts", rendererTypesSrc],
  ["use-aku-expression.ts", useExpressionSrc],
];

describe("expression renderer-seam purity (DR-070 D2)", () => {
  it("no consumer-layer file imports a concrete renderer", () => {
    const offenders = CONSUMER_SOURCES.filter(([, src]) =>
      /from\s+["'][^"']*css-sprite-renderer/.test(src),
    ).map(([name]) => name);
    expect(
      offenders,
      `These must depend on AkuExpressionRenderer (renderer-types.ts) only, not a concrete renderer:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
