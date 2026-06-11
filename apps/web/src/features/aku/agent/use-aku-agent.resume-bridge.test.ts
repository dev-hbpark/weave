import { describe, expect, it } from "vitest";
import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-171 — reconnect continuation bridge: when a local run dies on a transport
// failure, the server may still hold + replay it (grace, WI-034 / small-think
// WI-037 continuation note). The hook must (a) re-arm the WI-151 adoption path
// so the replayed run re-lights dim + roaming, and (b) invalidate the stale
// queue view on TERMINAL connection states so a dead link can never keep an
// adopted dim lit forever. Both live inside long-lived hook callbacks that a
// renderHook cannot reach without mocking the whole agocraft client, so —
// following the DR-030 deps-guard precedent — they are pinned as file-local
// source-fitness assertions. The adopt/release decision itself stays fully
// unit-tested in agent-resume.test.ts (pure decideResume).
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("useAkuAgent reconnect continuation bridge (WI-171)", () => {
  const src = stripComments(akuAgentSource);

  it("re-arms WI-151 adoption when a transport-failed run may resume server-side", () => {
    // The catch path computes `mayResume` from the LAST queue view's own jobs
    // and only then disengages — a first-dial failure (no own job) must not
    // re-arm, or a finished run's tail could be falsely adopted.
    expect(src).toMatch(/mayResume = \(queueStatusRef\.current\?\.jobs \?\? \[\]\)\.some/);
    expect(src).toMatch(/if \(mayResume\) engagedRef\.current = false;/);
  });

  it("invalidates the queue view on TERMINAL connection states (error/closed)", () => {
    expect(src).toMatch(
      /state === "error" \|\| detail\.state === "closed"[\s\S]{0,80}setQueueStatus\(null\)/,
    );
  });
});
