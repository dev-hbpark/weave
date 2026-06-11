import { describe, expect, it } from "vitest";
import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-174 — chat-panel reattach to a grace-replayed run. The orphan hooks'
// DECISIONS are unit-tested in orphan-turn.test.ts (pure); the hook WIRING
// lives inside long-lived callbacks a renderHook cannot reach without mocking
// the whole agocraft client — so, following the WI-171 resume-bridge
// precedent, the wiring is pinned as file-local source-fitness assertions.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("useAkuAgent orphan-frame chat bridge (WI-174)", () => {
  const src = stripComments(akuAgentSource);

  it("forwards both orphan hooks into connectAgocraftAgent via refs", () => {
    expect(src).toMatch(/onOrphanEvent: \(id, event\) => onOrphanEventRef\.current\(id, event\)/);
    expect(src).toMatch(
      /onOrphanResponse: \(response\) => onOrphanResponseRef\.current\(response\)/,
    );
  });

  it("gates every orphan frame on shouldHandleOrphanFrame (engaged/resumed)", () => {
    // Both handler impls check the gate before touching the transcript.
    const gates = src.match(
      /shouldHandleOrphanFrame\(\{ engaged: engagedRef\.current, resumed: resumedRef\.current \}\)/g,
    );
    expect(gates?.length).toBe(2);
  });

  it("adopt attaches the bubble; release clears the caption and resets the fold", () => {
    expect(src).toMatch(/action === "adopt"[\s\S]{0,200}?attachAdoptedBubble\(\);/);
    expect(src).toMatch(/action === "release"[\s\S]{0,600}?orphanBaseEditsRef\.current = null;/);
  });

  it("stop() and clear() both reset the orphan fold", () => {
    const resets = src.match(/orphanBaseEditsRef\.current = null;/g);
    // release + orphan response + stop + clear
    expect(resets?.length).toBeGreaterThanOrEqual(4);
  });
});
