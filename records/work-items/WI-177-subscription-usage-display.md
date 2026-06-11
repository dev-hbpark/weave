# WI-177 — byo-ssh 구독 사용량 %(5시간/주간) 푸터 표시

- Status: DONE (2026-06-11)
- Origin: 사용자 — "byo-ssh의 경우는 비용보다 5시간 사용량중에 몇퍼센트
  일주일 사용량중에 몇퍼센트를 사용했다라는것도 추가되면 좋겠어"
- Decision: DR-117
- Upstream: small-think WI-045/DR-059 (`cost` 이벤트의 additive `limits`)
- Builds on: WI-176/DR-116 (cost 푸터 + unknown-내로잉)

## 변경

- `types.ts`: `AkuLimitWindow { window, utilization(0–1), resetsAt?(epoch sec) }`
  + `AkuCostRecord.limits?` (cost 와 함께 영속).
- `agent/cost-event.ts`:
  - `costFromEvent` 가 `limits` 배열을 **항목 단위로** 형태 검증해 싣는다 —
    malformed 항목은 개별 탈락, malformed `resetsAt` 은 그 필드만 강등
    (costUsd 강등과 같은 정신: 부분 손상이 레코드를 죽이지 않는다).
  - 라벨/순서는 데이터 맵 (Rule 6): `LIMIT_WINDOW_LABELS`
    (five_hour→"5시간", seven_day→"주간", …, 미지 id 는 원문 표기) +
    `LIMIT_WINDOW_ORDER` (짧은 윈도우 먼저).
  - `formatPercent` (0–1 → "23%", 0–100% 클램프), `formatLimitsLine`
    ("5시간 23% · 주간 41%"); `formatCostLine` 이 비용 뒤에 이어 붙이고,
    `describeCostDetail` 은 리셋 시각 + "태스크 종료 시점의 전체 사용률"
    캐비앗 (다른 세션도 같은 윈도우를 소모 — 이 태스크의 소모분이 아님).
- MessageList / use-aku-agent 변경 없음 — WI-176 의 경로(코스트 폴드 +
  formatCostLine/describeCostDetail)가 자동으로 윈도우를 포함한다.
- api 모드는 서버가 windows 를 관측하지 않아 limits absent → 푸터 동일 (무해).

## Verification

- `cost-event.test.ts` 12 → 19 green (limits 통과/항목별 거부/resetsAt 강등,
  percent 클램프, 라벨·정렬·미지 id, 푸터 연결, 툴팁 캐비앗).
- apps/web vitest 108 파일 / 1121 green; tsc/biome clean.
- 루트 게이트 5종 green.
