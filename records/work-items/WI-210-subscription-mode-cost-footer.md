# WI-210 — 구독(ssh) 모드 비용 푸터: 예상비용 숨김 + "구독" 표시

- **Status:** Done · **DR:** DR-135 · **Relates:** WI-176/DR-058, DR-059, WI-055, WI-208/DR-133

## Problem

운영자: api 모드 비용($) 유지, ssh 모드는 예상비용 제거 + "구독 모드" 표시(세션/주간 사용량 유지).
codex-ssh가 WI-055로 API-환산 추정 costUsd를 보내 구독제와 모순 → 모드로 명시 게이트 필요.

## Change

- `agent-mode.ts`: `isSubscriptionMode(mode)` (byo-ssh/codex-ssh 집합).
- `types.ts`: `AkuCostRecord.subscription?: boolean`.
- `use-aku-agent.ts`: `serverInfoRef`(onServerInfo에서 동기) + `stampCost`(캡처 시 GRANTED 모드가
  ssh면 subscription:true) — 라이브 + orphan 경로 양쪽 적용.
- `cost-event.ts`: `formatCostLine` subscription→"구독"(costUsd 대체, 윈도우 유지);
  `describeCostDetail` 툴팁 구독 문구.

## Acceptance

- ssh 모드 푸터: "입력 … · 출력 … 토큰 · 구독 · Session 23% · 주간 41%"(달러 없음). ✔
- api/openai-api: 종전대로 $ 표시. ✔
- per-message stamp(모드 전환 후 과거 버블 불변). ✔
- cost-event 테스트 + aku 242 그린, tsc·biome 클린. ✔

## Links

- DR-135
