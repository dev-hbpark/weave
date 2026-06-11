import { describe, expect, it } from "vitest";
import {
  costFromEvent,
  describeCostDetail,
  formatCostLine,
  formatTokens,
  formatUsd,
} from "./cost-event.js";
import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-176 — per-task cost display (small-think DR-058 downstream). The vendored
// client's TaskEvent union doesn't know "cost" yet; the parser narrows from
// `unknown` so the event passes through the onUnknown:"preserve" transport
// without a re-vendor. The hook WIRING (both the live onEvent and the orphan
// handler) is pinned as source-fitness per the WI-175 precedent.

describe("costFromEvent (WI-176)", () => {
  const valid = {
    type: "cost",
    inputTokens: 1200,
    outputTokens: 3400,
    cacheReadTokens: 56000,
    cacheWriteTokens: 780,
    costUsd: 0.0345,
  };

  it("narrows a well-formed cost event (costUsd carried through)", () => {
    expect(costFromEvent(valid)).toEqual({
      inputTokens: 1200,
      outputTokens: 3400,
      cacheReadTokens: 56000,
      cacheWriteTokens: 780,
      costUsd: 0.0345,
    });
  });

  it("costUsd is optional — absent (unknown model family) stays absent, no fake zero", () => {
    const { costUsd: _c, ...tokensOnly } = valid;
    expect(costFromEvent(tokensOnly)).toEqual({
      inputTokens: 1200,
      outputTokens: 3400,
      cacheReadTokens: 56000,
      cacheWriteTokens: 780,
    });
    expect(costFromEvent(tokensOnly)).not.toHaveProperty("costUsd");
  });

  it("ignores every other event type (the normal stream)", () => {
    expect(costFromEvent({ type: "message", turn: 1, text: "hi" })).toBeUndefined();
    expect(costFromEvent({ type: "tool", name: "weave.item.add", ok: true })).toBeUndefined();
    expect(costFromEvent(null)).toBeUndefined();
    expect(costFromEvent("cost")).toBeUndefined();
  });

  it("rejects a malformed cost event (missing / non-finite token fields)", () => {
    expect(costFromEvent({ type: "cost", inputTokens: 1, outputTokens: 2 })).toBeUndefined();
    expect(costFromEvent({ ...valid, cacheReadTokens: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(costFromEvent({ ...valid, outputTokens: "3400" })).toBeUndefined();
  });

  it("a malformed costUsd degrades to tokens-only (does not kill the record)", () => {
    expect(costFromEvent({ ...valid, costUsd: "0.03" })).not.toHaveProperty("costUsd");
  });
});

describe("cost formatting", () => {
  it("compacts token counts (k-suffix at 1000, trailing .0 trimmed)", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(12000)).toBe("12k");
  });

  it("USD: 4 decimals under $1 (estimate precision), 2 above", () => {
    expect(formatUsd(0.0345)).toBe("$0.0345");
    expect(formatUsd(2.345)).toBe("$2.35");
  });

  it("footer line folds cache reads/writes into INPUT (what actually entered the model)", () => {
    expect(
      formatCostLine({
        inputTokens: 1200,
        outputTokens: 3400,
        cacheReadTokens: 56000,
        cacheWriteTokens: 800,
        costUsd: 0.0345,
      }),
    ).toBe("입력 58k · 출력 3.4k 토큰 · $0.0345");
  });

  it("footer omits the dollar part when costUsd is absent (tokens-only servers)", () => {
    expect(
      formatCostLine({
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe("입력 100 · 출력 200 토큰");
  });

  it("tooltip carries the exact breakdown + the estimate caveat", () => {
    const detail = describeCostDetail({
      inputTokens: 1200,
      outputTokens: 3400,
      cacheReadTokens: 56000,
      cacheWriteTokens: 800,
      costUsd: 0.0345,
    });
    expect(detail).toContain("캐시 읽기 56,000");
    expect(detail).toContain("캐시 쓰기 800");
    expect(detail).toContain("$0.0345 (api 모드는 추정치)");
  });
});

describe("useAkuAgent cost wiring (source-fitness)", () => {
  const src = akuAgentSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("the live onEvent path folds the cost event onto the bubble", () => {
    expect(src).toMatch(/const cost = costFromEvent\(event\);/);
  });

  it("the orphan (adopted-run) path does too — a replayed run still reports its cost", () => {
    expect(src).toMatch(/const orphanCost = costFromEvent\(event\);/);
  });
});
