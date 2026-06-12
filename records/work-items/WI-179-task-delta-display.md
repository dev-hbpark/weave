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
- **푸터**: `"Session 33%(+3%) · 주간 41%(+<1%)"` — `formatDeltaSuffix` 는
  측정값의 소수점을 그대로 통과(`(+0.5%)`, 최대 2자리·후행 0 제거) — 표시층
  정밀도 손실 없음. 현재 API 헤더 원천 해상도는 1%(라이브 관측: 0.07/0.35
  등 소수 2자리 fraction)라 실측은 정수 %지만 헤더가 정밀해지면 자동 반영.
  측정 0 은 "원천 해상도 아래"이므로 `(+<1%)` — 0.99% 소모여도 헤더가 0 을
  주므로 `+0%` 단정이 오히려 fake data. **taskDelta 부재 시 접미사 없음** —
  부재는 "귀속 불가"(동시 태스크/리셋)이지 0 이 아니므로 위조하지 않는다.
- **호버**: 델타 있으면 "(+%)는 이 태스크 단독 실행 구간의 증가분", 없으면
  "동시 태스크 실행 등으로 이 태스크만의 증가분은 분리 불가" 안내.
- 구 레코드(델타 없이 영속된 cost)는 소급되지 않음 — 접미사 없이 그대로.

## Verification

`cost-event.test.ts` 23 green (taskDelta 파싱/강등 1 + 푸터 접미사 1 +
소수점 통과 1 + 호버 양 케이스 1 추가); weave 루트 5 게이트 + tsc +
vitest 전체 green.
