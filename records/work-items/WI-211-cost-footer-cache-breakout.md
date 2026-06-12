# WI-211 — 비용 푸터에 캐시 재독분 분리 표기 + m 단위

- **Status:** DONE (2026-06-13) · **Relates:** WI-176(비용 푸터)/WI-210(구독 표기),
  small-think WI-057/DR-071(LlmUsage disjoint 정규화 — 본 표시 변경의 발단)
- **Origin:** 운영자 "캐시분도 따로 표시해주면 좋겠어" — 입력 합산만 보여주면 모델·모드 간
  토큰 격차(대부분 10% 단가 캐시 재독)가 실비용 격차로 오해됨.

## Change (`features/aku/agent/cost-event.ts`)

- `formatCostLine`: cacheRead > 0이면 `입력 4.2m (캐시 3.9m) · 출력 …` — 입력의 의미
  (캐시 포함, 모델에 실제 들어간 총량)는 유지하고 그중 캐시 재독분을 괄호로 분리.
  cacheRead=0이면 종전과 동일(괄호 없음). 읽기/쓰기 정확 분해는 호버 툴팁(기존
  `describeCostDetail`)이 담당 — 푸터는 한 줄 유지.
- `formatTokens`: `m` 단위 추가(≥1,000,000) — byo-ssh 캐시 재독이 태스크당 수백만
  토큰이라 "4150.5k"는 못 읽음.

서버/계약 변경 없음 — cost 이벤트는 이미 cacheReadTokens를 싣고 있었음(DR-058).

## SVL

cost-event 25 green(신규: 캐시 분리/m 단위), `tsc --noEmit` 클린, biome 클린.
배포는 Vercel push 후 반영.
