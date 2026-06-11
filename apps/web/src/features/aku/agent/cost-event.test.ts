import { describe, expect, it } from "vitest";
import {
  costFromEvent,
  describeCostDetail,
  formatCostLine,
  formatLimitsLine,
  formatPercent,
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

  it("carries the subscription windows through (WI-177 — small-think DR-059)", () => {
    const withLimits = {
      ...valid,
      limits: [
        { window: "five_hour", utilization: 0.23, resetsAt: 1_770_000_000 },
        { window: "seven_day", utilization: 0.41 },
      ],
    };
    expect(costFromEvent(withLimits)?.limits).toEqual([
      { window: "five_hour", utilization: 0.23, resetsAt: 1_770_000_000 },
      { window: "seven_day", utilization: 0.41 },
    ]);
  });

  it("drops malformed window ENTRIES individually; empty/absent/garbage limits → absent", () => {
    const mixed = {
      ...valid,
      limits: [
        { window: "five_hour", utilization: 0.23 },
        { window: "", utilization: 0.5 }, // empty id
        { window: "seven_day", utilization: "0.41" }, // non-number
        { window: "seven_day", utilization: Number.NaN }, // non-finite
        null,
      ],
    };
    expect(costFromEvent(mixed)?.limits).toEqual([{ window: "five_hour", utilization: 0.23 }]);
    expect(costFromEvent(valid)).not.toHaveProperty("limits");
    expect(costFromEvent({ ...valid, limits: [] })).not.toHaveProperty("limits");
    expect(costFromEvent({ ...valid, limits: "nope" })).not.toHaveProperty("limits");
  });

  it("a malformed resetsAt degrades to a reset-less window (does not kill the entry)", () => {
    const e = { ...valid, limits: [{ window: "five_hour", utilization: 0.1, resetsAt: "soon" }] };
    expect(costFromEvent(e)?.limits).toEqual([{ window: "five_hour", utilization: 0.1 }]);
  });

  it("carries taskDelta through (WI-179 — small-think WI-047); malformed/negative degrades the field only", () => {
    const e = {
      ...valid,
      limits: [
        { window: "five_hour", utilization: 0.33, taskDelta: 0.03 },
        { window: "seven_day", utilization: 0.41, taskDelta: "0.03" }, // non-number
        { window: "overage", utilization: 0.1, taskDelta: -0.2 }, // negative
      ],
    };
    expect(costFromEvent(e)?.limits).toEqual([
      { window: "five_hour", utilization: 0.33, taskDelta: 0.03 },
      { window: "seven_day", utilization: 0.41 },
      { window: "overage", utilization: 0.1 },
    ]);
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

  it("percent: 0–1 fraction rendered as a rounded %, clamped defensively", () => {
    expect(formatPercent(0.23)).toBe("23%");
    expect(formatPercent(0.005)).toBe("1%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1.7)).toBe("100%"); // defensive clamp
    expect(formatPercent(-0.1)).toBe("0%");
  });

  it("limits line: labeled via the window registry, short window first, unknown id verbatim", () => {
    expect(
      formatLimitsLine([
        { window: "seven_day", utilization: 0.41 }, // arrival order reversed on purpose
        { window: "five_hour", utilization: 0.23 },
      ]),
    ).toBe("5시간 23% · 주간 41%");
    expect(formatLimitsLine([{ window: "lunar_cycle", utilization: 0.5 }])).toBe("lunar_cycle 50%");
  });

  it("footer appends the subscription windows after the cost (byo-ssh)", () => {
    expect(
      formatCostLine({
        inputTokens: 1200,
        outputTokens: 3400,
        cacheReadTokens: 56000,
        cacheWriteTokens: 800,
        costUsd: 0.0345,
        limits: [
          { window: "five_hour", utilization: 0.23 },
          { window: "seven_day", utilization: 0.41 },
        ],
      }),
    ).toBe("입력 58k · 출력 3.4k 토큰 · $0.0345 · 5시간 23% · 주간 41%");
  });

  it("limits line appends this task's delta when attributed (WI-179): solo run = (+N%), sub-1% = (+<1%)", () => {
    expect(
      formatLimitsLine([
        { window: "five_hour", utilization: 0.33, taskDelta: 0.03 },
        { window: "seven_day", utilization: 0.41, taskDelta: 0 },
      ]),
    ).toBe("5시간 33%(+3%) · 주간 41%(+<1%)");
    // absent taskDelta (overlapped run / window reset) → no suffix, NOT "+0%"
    expect(formatLimitsLine([{ window: "five_hour", utilization: 0.33 }])).toBe("5시간 33%");
  });

  it("delta passes measured decimals through verbatim — no display-layer precision loss", () => {
    expect(formatLimitsLine([{ window: "five_hour", utilization: 0.33, taskDelta: 0.005 }])).toBe(
      "5시간 33%(+0.5%)",
    );
    expect(formatLimitsLine([{ window: "five_hour", utilization: 0.33, taskDelta: 0.0025 }])).toBe(
      "5시간 33%(+0.25%)",
    );
    // a measured 0 means "below the source resolution", not "consumed nothing"
    expect(formatLimitsLine([{ window: "five_hour", utilization: 0.33, taskDelta: 0 }])).toBe(
      "5시간 33%(+<1%)",
    );
  });

  it("tooltip explains the delta as the solo-run increase; absent delta gets the why-not note", () => {
    const withDelta = describeCostDetail({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      limits: [{ window: "five_hour", utilization: 0.33, taskDelta: 0.03 }],
    });
    expect(withDelta).toContain("5시간 33%(+3%)");
    expect(withDelta).toContain("단독 실행 구간의 증가분");
    const withoutDelta = describeCostDetail({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      limits: [{ window: "five_hour", utilization: 0.33 }],
    });
    expect(withoutDelta).toContain("증가분은 분리 불가");
  });

  it("tooltip explains the windows as CURRENT fill (not this task's burn), with reset time", () => {
    const detail = describeCostDetail({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      limits: [{ window: "five_hour", utilization: 0.23, resetsAt: 1_770_000_000 }],
    });
    expect(detail).toContain("구독 윈도우 5시간 23%");
    expect(detail).toContain("리셋");
    expect(detail).toContain("태스크 종료 시점의 전체 사용률");
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
