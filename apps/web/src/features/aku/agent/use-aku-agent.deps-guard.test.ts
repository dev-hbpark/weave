import { describe, expect, it } from "vitest";
import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-075 / DR-030 — architectural fitness guard for useAkuAgent's stale-closure
// invariant.
//
// The hook's long-lived async callbacks (runTurn 등) are memoized with a stable
// dependency array that INTENTIONALLY omits `deps`, so they are created once and
// keep the first-render `deps` forever. Reading a volatile dep off `deps` inside
// them therefore captures the first-render value and goes stale — that exact bug
// shipped as the agent "added frames fit at 100% instead of the shared 70%"
// regression (`onFramesAdded` was read off the captured `deps`, so a stale
// `handleFitAll` over an empty initial document no-op'd the fit).
//
// The rule: render-stable values (`editor`, `designId`, `url`, `token`) are
// destructured ONCE at the top; every VOLATILE dep (getters + callbacks) is read
// through `depsRef.current.*`. So the (comment-stripped) source must contain ZERO
// member accesses off the bare `deps` parameter.
//
// Why a file-local guard test instead of a global biome/eslint rule: `deps` is a
// generic parameter name used in ~95 places across this repo, so a syntactic ban
// on member access there would be almost entirely false positives. This invariant
// is file-local, so it is enforced file-locally — same CI-blocking effect, zero
// blast radius. (`depsRef.current.*` is allowed: the pattern requires `deps`
// immediately followed by `.`, which `depsRef.` is not.)
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("useAkuAgent deps stale-closure guard (DR-030)", () => {
  it("never reads a member off the bare `deps` param — volatile deps go through depsRef.current", () => {
    const offenders = stripComments(akuAgentSource)
      .split("\n")
      .map((line, i) => ({ n: i + 1, line }))
      .filter(({ line }) => /\bdeps\.\w/.test(line));
    expect(
      offenders,
      `Read these via depsRef.current.* instead, or destructure render-stable values at the top (DR-030):\n${offenders
        .map((o) => `  L${o.n}: ${o.line.trim()}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
