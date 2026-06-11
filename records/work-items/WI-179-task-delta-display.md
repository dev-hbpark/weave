# WI-179 — 구독 윈도우 태스크 증가분 표시 (taskDelta)

- Status: DONE (2026-06-11)
- Origin: 운영자 요청 — 누적 %만이 아니라 "이 작업의 증가분"을 보고 싶다
- Upstream: small-think WI-047/DR-061 (서버가 cost.limits 항목에
  `taskDelta` 0–1 을 additive 로 동봉 — 솔로 실행 + 윈도우 무리셋일 때만)
- Relates: WI-177/DR-117 (누적 % 표시)

## Decision (inline)

- **파싱**: `limitFromEntry` 가 `taskDelta` 를 필드-단위 검증(유한수 +
  비음수)으로 동봉 — malformed 는 필드만 강등, 누적 % 표시는 유지
  (resetsAt 과 동일 패턴). 재vendor 불필요 (cost 이벤트는 unknown 파싱).
- **푸터**: `"5시간 33%(+3%) · 주간 41%(+<1%)"` — `formatDeltaSuffix` 가
  1% 미만(반올림 0)은 `(+<1%)`. **taskDelta 부재 시 접미사 없음** — 부재는
  "귀속 불가"(동시 태스크/리셋)이지 0 이 아니므로 `+0%` 로 위조하지 않는다.
- **호버**: 델타 있으면 "(+%)는 이 태스크 단독 실행 구간의 증가분", 없으면
  "동시 태스크 실행 등으로 이 태스크만의 증가분은 분리 불가" 안내.
- 구 레코드(델타 없이 영속된 cost)는 소급되지 않음 — 접미사 없이 그대로.

## Verification

`cost-event.test.ts` 22 green (taskDelta 파싱/강등 1 + 푸터 접미사 1 +
호버 양 케이스 1 추가); weave 루트 5 게이트 + tsc + vitest 1124 green.
