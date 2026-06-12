/**
 * 태스크 비용 이벤트 파서 + 표시 포맷 (WI-176 — small-think DR-058 다운스트림).
 *
 * 서버는 태스크당 정확히 1회, ok 응답 직전에 additive `cost` 이벤트를 스트림한다:
 * `{type:"cost", inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd?}`.
 * 벤더링된 클라이언트(0.1.6)의 `TaskEvent` 유니온은 이 타입을 아직 모른다 —
 * 전송 계층은 onUnknown:"preserve" 계약(DR-011)으로 그대로 통과시키므로, 여기서
 * `unknown` 으로 받아 형태를 검증해 좁힌다 (닫힌 유니온과의 비교 금지, 재-vendor 불필요).
 */

import type { AkuCostRecord, AkuLimitWindow } from "../types.js";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** `limits` 항목 1개를 형태 검증으로 좁힌다 — window 문자열 + 유한 utilization 이
 *  필수, resetsAt 은 유한수일 때만 동봉. malformed 항목은 개별 탈락 (전체 강등 아님). */
function limitFromEntry(entry: unknown): AkuLimitWindow | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const w = entry as {
    readonly window?: unknown;
    readonly utilization?: unknown;
    readonly resetsAt?: unknown;
    readonly taskDelta?: unknown;
  };
  if (typeof w.window !== "string" || w.window === "") return undefined;
  if (!isFiniteNumber(w.utilization)) return undefined;
  // taskDelta (small-think WI-047): 이 태스크의 소모분 0–1. malformed(비유한/음수)는
  // 필드만 강등 — 누적 % 표시는 유지된다 (resetsAt 과 동일한 필드-단위 방어).
  const taskDelta = isFiniteNumber(w.taskDelta) && w.taskDelta >= 0 ? w.taskDelta : undefined;
  return {
    window: w.window,
    utilization: w.utilization,
    ...(isFiniteNumber(w.resetsAt) ? { resetsAt: w.resetsAt } : {}),
    ...(taskDelta !== undefined ? { taskDelta } : {}),
  };
}

/** `cost` 이벤트면 AkuCostRecord 로 좁혀 반환, 아니면 undefined (무시). */
export function costFromEvent(event: unknown): AkuCostRecord | undefined {
  if (typeof event !== "object" || event === null) return undefined;
  const e = event as {
    readonly type?: unknown;
    readonly inputTokens?: unknown;
    readonly outputTokens?: unknown;
    readonly cacheReadTokens?: unknown;
    readonly cacheWriteTokens?: unknown;
    readonly costUsd?: unknown;
    readonly limits?: unknown;
  };
  if (e.type !== "cost") return undefined;
  if (
    !isFiniteNumber(e.inputTokens) ||
    !isFiniteNumber(e.outputTokens) ||
    !isFiniteNumber(e.cacheReadTokens) ||
    !isFiniteNumber(e.cacheWriteTokens)
  )
    return undefined;
  // 구독 윈도우 (small-think DR-059 — 구독 모드 byo-ssh/codex-ssh) — malformed
  // costUsd 처럼 토큰-온리로 강등하되, 배열이면 항목 단위로 검증해 살아남은 것만 싣는다.
  const limits = Array.isArray(e.limits)
    ? e.limits.map(limitFromEntry).filter((w): w is AkuLimitWindow => w !== undefined)
    : [];
  return {
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    cacheReadTokens: e.cacheReadTokens,
    cacheWriteTokens: e.cacheWriteTokens,
    ...(isFiniteNumber(e.costUsd) ? { costUsd: e.costUsd } : {}),
    ...(limits.length > 0 ? { limits } : {}),
  };
}

/** 1234 → "1.2k", 12000 → "12k", 999 → "999" — 푸터용 압축 토큰 수. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  const s = k.toFixed(1);
  return `${s.endsWith(".0") ? s.slice(0, -2) : s}k`;
}

/** $1 미만은 소수 4자리(추정 비용의 유효 자릿수), 이상은 2자리. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

/** 구독 윈도우 id → 한글 라벨 (Rule 6: 데이터 맵, 미지 id 는 원문 표기). */
const LIMIT_WINDOW_LABELS: Readonly<Record<string, string>> = {
  five_hour: "Session",
  seven_day: "주간",
  seven_day_opus: "주간 Opus",
  seven_day_sonnet: "주간 Sonnet",
  overage: "초과분",
};

/** 표시 순서 — 짧은 윈도우 먼저, 미지 id 는 맨 뒤(도착 순 유지). */
const LIMIT_WINDOW_ORDER: Readonly<Record<string, number>> = {
  five_hour: 0,
  seven_day: 1,
  seven_day_opus: 2,
  seven_day_sonnet: 3,
  overage: 4,
};

function limitLabel(window: string): string {
  return LIMIT_WINDOW_LABELS[window] ?? window;
}

function sortedLimits(limits: ReadonlyArray<AkuLimitWindow>): ReadonlyArray<AkuLimitWindow> {
  return [...limits].sort(
    (a, b) => (LIMIT_WINDOW_ORDER[a.window] ?? 99) - (LIMIT_WINDOW_ORDER[b.window] ?? 99),
  );
}

/** 0–1 fraction → "23%" (표시 방어상 0–100% 로 클램프). */
export function formatPercent(utilization: number): string {
  return `${Math.round(Math.min(Math.max(utilization, 0), 1) * 100)}%`;
}

/** 이 태스크의 증가분(taskDelta 0–1) → "(+3%)". 측정값이 가진 소수점은 그대로
 *  통과("(+0.5%)") — 표시층에서 정밀도를 깎지 않는다(최대 2자리, 후행 0 제거).
 *  현재 API 헤더의 원천 해상도는 1%(소수 2자리 fraction)라 실측은 정수 %지만,
 *  헤더가 정밀해지면 자동으로 살아난다. 측정 0 은 "원천 해상도 아래"라는 뜻이라
 *  "(+<1%)" — 0.99% 소모여도 헤더는 0 을 주므로 "+0%" 단정이 오히려 fake data.
 *  부재 시 빈 문자열 — 부재는 "귀속 불가"(동시 실행/윈도우 리셋)이지 0이 아니다. */
export function formatDeltaSuffix(taskDelta: number | undefined): string {
  if (taskDelta === undefined) return "";
  const pct = Math.min(Math.max(taskDelta, 0), 1) * 100;
  const s = String(Math.round(pct * 100) / 100);
  return s === "0" ? "(+<1%)" : `(+${s}%)`;
}

/** "Session 23%(+3%) · 주간 41%(+<1%)" — 푸터에 이어 붙는 구독 윈도우 사용률.
 *  괄호의 증가분은 이 태스크가 단독 실행됐을 때만 서버가 보내준다 (WI-047). */
export function formatLimitsLine(limits: ReadonlyArray<AkuLimitWindow>): string {
  return sortedLimits(limits)
    .map(
      (w) =>
        `${limitLabel(w.window)} ${formatPercent(w.utilization)}${formatDeltaSuffix(w.taskDelta)}`,
    )
    .join(" · ");
}

/** 버블 푸터 한 줄 — 입력은 캐시 읽기/쓰기 포함 총량 (모델에 실제로 들어간 토큰).
 *  구독 모드(byo-ssh/codex-ssh, `subscription:true`)면 예상비용($)을 숨기고 "구독"으로
 *  표기한다 — 구독제는 토큰당 과금이 아니므로 추정 달러는 오해를 부른다. 실 사용량은
 *  뒤에 붙는 구독 윈도우("Session 23% · 주간 41%", 증가분)로 본다. api 모드는 종전대로
 *  실제 추정 달러를 표시. */
export function formatCostLine(c: AkuCostRecord): string {
  const input = c.inputTokens + c.cacheReadTokens + c.cacheWriteTokens;
  const parts = [`입력 ${formatTokens(input)}`, `출력 ${formatTokens(c.outputTokens)} 토큰`];
  if (c.subscription === true) parts.push("구독");
  else if (c.costUsd !== undefined) parts.push(formatUsd(c.costUsd));
  if (c.limits !== undefined && c.limits.length > 0) parts.push(formatLimitsLine(c.limits));
  return parts.join(" · ");
}

/** 윈도우 리셋 시각 (epoch 초) → "6/11 21:30" 풍의 짧은 로컬 표기. */
function formatResetAt(resetsAt: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(resetsAt * 1000));
}

/** 호버 툴팁 — 정확한 원본 수치 분해 (api 모드 달러는 공개 단가 기준 추정치).
 *  구독 윈도우는 "지금 윈도우가 찬 %"(다른 세션 포함)이지 이 태스크의 소모분이 아니다. */
export function describeCostDetail(c: AkuCostRecord): string {
  const parts = [
    `입력 ${c.inputTokens.toLocaleString()}`,
    `캐시 읽기 ${c.cacheReadTokens.toLocaleString()}`,
    `캐시 쓰기 ${c.cacheWriteTokens.toLocaleString()}`,
    `출력 ${c.outputTokens.toLocaleString()} 토큰`,
  ];
  if (c.subscription === true) parts.push("구독 모드 — 토큰당 과금 없음(구독제), 예상비용 미표시");
  else if (c.costUsd !== undefined) parts.push(`${formatUsd(c.costUsd)} (api 모드는 추정치)`);
  if (c.limits !== undefined && c.limits.length > 0) {
    const windows = sortedLimits(c.limits)
      .map(
        (w) =>
          `${limitLabel(w.window)} ${formatPercent(w.utilization)}${formatDeltaSuffix(w.taskDelta)}${
            w.resetsAt !== undefined ? ` (${formatResetAt(w.resetsAt)} 리셋)` : ""
          }`,
      )
      .join(" · ");
    const hasDelta = c.limits.some((w) => w.taskDelta !== undefined);
    parts.push(
      `구독 윈도우 ${windows} — 태스크 종료 시점의 전체 사용률${
        hasDelta
          ? ", (+%)는 이 태스크 단독 실행 구간의 증가분"
          : " (동시 태스크 실행 등으로 이 태스크만의 증가분은 분리 불가)"
      }`,
    );
  }
  return parts.join(" · ");
}
