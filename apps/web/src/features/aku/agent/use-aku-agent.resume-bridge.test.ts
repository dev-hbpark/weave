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
    // WI-173 — the re-arm is UNCONDITIONAL: gating it on the stale queue view
    // (`if (mayResume)`) left `engaged` stuck whenever a terminal state wiped
    // the view while the server still grace-held the run — the replay then
    // edited with dim/roaming off. `mayResume` survives only as the message
    // picker. False adoption stays impossible without an own job: pure
    // decideResume adopts only when the queue actually lists one (and a
    // first-dial failure / Stop never produces one).
    expect(src).toMatch(
      /mayResume = \(queueStatusRef\.current\?\.jobs \?\? \[\]\)\.some[\s\S]{0,200}?engagedRef\.current = false;/,
    );
    expect(src).not.toMatch(/if \(mayResume\) engagedRef\.current/);
  });

  it("invalidates the queue view on TERMINAL connection states (error/closed)", () => {
    expect(src).toMatch(
      /state === "error" \|\| detail\.state === "closed"[\s\S]{0,80}setQueueStatus\(null\)/,
    );
  });
});
