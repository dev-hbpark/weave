# DR-135 — 구독(ssh) 모드 비용 푸터: 예상비용 숨김 + "구독" 표시

- **Date:** 2026-06-13 · **Status:** Accepted · **WI:** WI-210
- **Relates:** WI-176/DR-058(cost 이벤트), DR-059(구독 윈도우), WI-204/WI-055(codex-ssh API-환산 costUsd), WI-208/DR-133(provider×transport)

## Context

운영자: api 모드는 실행 후 비용($) 표시 유지, **ssh 모드(byo-ssh/codex-ssh)는 예상비용을 제거하고
"구독 모드"로 표시**, 세션/주간 사용량(증가분)은 유지. 배경: ssh 모드는 구독제라 토큰당 과금이
아닌데, codex-ssh가 WI-055로 **API-환산 추정 costUsd를 보내기 시작**해 푸터에 "$"가 떠 구독제와
모순(오해 유발). byo-ssh도 SDK가 total_cost_usd를 보냄. 즉 "costUsd 부재 시 자연 강등"만으로는
부족 — **모드로 명시 게이트**해야 한다.

## Decision

- `AkuCostRecord`에 `subscription?: boolean` 추가. **캡처 시점**에 stamp — cost 이벤트 도착 시
  GRANTED 모드(`serverInfo.mode`)가 ssh면 true. per-message 정확: 버블은 자신이 실행된 모드를
  유지(패널이 이후 모드를 바꿔도 과거 버블 불변).
- 모드→구독 판정은 `isSubscriptionMode(mode)` (agent-mode.ts, `{byo-ssh, codex-ssh}` 집합 —
  Rule 6 데이터, serverInfo.mode 임의 문자열 안전).
- `formatCostLine`: `subscription===true`면 **costUsd 대신 "구독"** 표기, 윈도우는 그대로 뒤에
  붙음. api/openai-api(미설정)는 종전대로 $ 표시.
- `describeCostDetail`(툴팁): 구독이면 "구독 모드 — 토큰당 과금 없음(구독제), 예상비용 미표시".
- stamp는 라이브 경로(onEvent)와 재입양(orphan) 경로 양쪽. serverInfo는 `serverInfoRef`로 핸들러
  클로저에 fresh 제공.

## 트레이드오프

- (+) 구독제에 맞지 않는 추정 달러 제거 — 사용자는 "구독 + 윈도우 사용률"만 본다(정확한 멘탈 모델).
- (+) 서버 무변경(costUsd는 계속 audit/telemetry로 기록) — 클라 표시층만 게이트.
- (+) 캡처 stamp라 모드 전환 후에도 과거 버블이 옳은 표시 유지.
- (−) transport 토글은 여전히 [API|SSH] (전송 축 라벨 유지) — "구독"은 비용 표시에만(전송≠과금모델
  분리 유지). 구독 라벨을 토글에 합치지 않음(의도적).

## Verification

`cost-event.test.ts` — 구독 게이팅 2종(costUsd 보내도 "구독"으로 대체 + 윈도우 유지; 윈도우 없어도
"구독") + 기존 api 경로 무회귀. aku 스위트 242 그린, `tsc`·biome 클린.

## Links

- `agent-mode.ts`(isSubscriptionMode)·`types.ts`(AkuCostRecord.subscription)·`cost-event.ts`(formatCostLine/describeCostDetail)·`use-aku-agent.ts`(serverInfoRef+stampCost)
