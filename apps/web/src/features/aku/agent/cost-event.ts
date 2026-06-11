/**
 * 태스크 비용 이벤트 파서 + 표시 포맷 (WI-176 — small-think DR-058 다운스트림).
 *
 * 서버는 태스크당 정확히 1회, ok 응답 직전에 additive `cost` 이벤트를 스트림한다:
 * `{type:"cost", inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd?}`.
 * 벤더링된 클라이언트(0.1.6)의 `TaskEvent` 유니온은 이 타입을 아직 모른다 —
 * 전송 계층은 onUnknown:"preserve" 계약(DR-011)으로 그대로 통과시키므로, 여기서
 * `unknown` 으로 받아 형태를 검증해 좁힌다 (닫힌 유니온과의 비교 금지, 재-vendor 불필요).
 */

import type { AkuCostRecord } from "../types.js";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
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
  };
  if (e.type !== "cost") return undefined;
  if (
    !isFiniteNumber(e.inputTokens) ||
    !isFiniteNumber(e.outputTokens) ||
    !isFiniteNumber(e.cacheReadTokens) ||
    !isFiniteNumber(e.cacheWriteTokens)
  )
    return undefined;
  return {
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    cacheReadTokens: e.cacheReadTokens,
    cacheWriteTokens: e.cacheWriteTokens,
    ...(isFiniteNumber(e.costUsd) ? { costUsd: e.costUsd } : {}),
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

/** 버블 푸터 한 줄 — 입력은 캐시 읽기/쓰기 포함 총량 (모델에 실제로 들어간 토큰). */
export function formatCostLine(c: AkuCostRecord): string {
  const input = c.inputTokens + c.cacheReadTokens + c.cacheWriteTokens;
  const parts = [`입력 ${formatTokens(input)}`, `출력 ${formatTokens(c.outputTokens)} 토큰`];
  if (c.costUsd !== undefined) parts.push(formatUsd(c.costUsd));
  return parts.join(" · ");
}

/** 호버 툴팁 — 정확한 원본 수치 분해 (api 모드 달러는 공개 단가 기준 추정치). */
export function describeCostDetail(c: AkuCostRecord): string {
  const parts = [
    `입력 ${c.inputTokens.toLocaleString()}`,
    `캐시 읽기 ${c.cacheReadTokens.toLocaleString()}`,
    `캐시 쓰기 ${c.cacheWriteTokens.toLocaleString()}`,
    `출력 ${c.outputTokens.toLocaleString()} 토큰`,
  ];
  if (c.costUsd !== undefined) parts.push(`${formatUsd(c.costUsd)} (api 모드는 추정치)`);
  return parts.join(" · ");
}
