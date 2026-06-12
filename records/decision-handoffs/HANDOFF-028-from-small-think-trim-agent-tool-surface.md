# HANDOFF-028 — (from small-think) Aku 입력 토큰 지배자 = advertised 도구 스키마 ~20K × 매 턴 재독 → 도구 표면 축소 제안

- **From:** small-think (consumer / 측정 주체) · **To:** weave (도구 소유자)
- **Date:** 2026-06-13 · **Status:** Proposed (분석 완료 · weave 구현 결정 대기)
- **small-think:** DR-067 / WI-053 · **Relates:** DR-046, DR-048(subtree-first parity 기각), HANDOFF-025/026

## 무엇을 측정했나

운영자 보고("Aku 입력 토큰 과다")를 라이브 로그로 분해(`smallthink-agent-server.log`, task-cost
77건):

- 입력측 토큰의 **96.3%가 cacheReadTokens** — 캐싱은 잘 먹음. 문제는 **재독 볼륨**.
- **cacheRead ≈ 턴 수(평균 27.5~40) × 정적 prefix.** per-turn 재독 ~36–53K가 prefix
  (cacheWrite 중앙값 ~97K)와 같은 자릿수 → 트랜스크립트 누적이 아니라 **매 턴 재독되는 정적
  prefix가 지배.**
- prefix 안에서 가장 크고 미탐색된 덩어리 = **weave가 광고하는 ~48개 도구 스키마 ~20K 토큰**
  (`apps/web/src/features/aku/agent/weave-command-schemas.ts` = **79.7KB**). 매 턴 재독 ×40턴.
- **로그상 실제 사용된 도구는 ~15개**: `item.add`·`batch`·`frame.setLayout`·`item.update`·
  `chart.add`·`design.snapshot`·`item.setLayoutChild`·`item.sendToBack`에 집중.
- 거의 안 쓰인 도구(예): `item.swapGridCells`·`item.dropGridCell`·`shape.breakToLine`·
  `line.closeToShape`·`frame.removeKeepingChildren`·`item.add/removeBehavior`·
  `items.duplicateInPlace/WithDelta`·`pages.duplicate`·`item.setDecoration`·`item.flip`·
  `shape.setVertices`·`image.setCrop` 등.

## 왜 다른 레버가 아닌가 (반증)

- subtree.add 재안내 → DR-048에서 v2도 67→74 parity, 이득 0(품질 회귀 리스크만).
- tool_result echo → weave 변경 도구는 **id만 반환**(가벼움). 주범 아님.
- 병렬 tool use → 이미 byo-ssh-agent 턴당 2.04콜(39% 병렬). 수정 storm → 비율 0.40(건강).
- 턴 수 → DR-048이 본질적 비용으로 판정.

곱셈 `cacheRead = turns × prefix`에서 turns는 닫혀 있고, **prefix가 유일하게 열린 축**이며 그
안에서 도구 스키마가 최대 단일 항목이다.

## weave 측 제안 액션 (결정/구현은 weave 소유)

1. **정적 prune (1차 권장, 저리스크):** 사용 빈도 0~희소 micro-tool을 advertised 목록에서
   제거하거나 `batch`/`items.*`/`item.update`로 흡수. 목표: ~48 → ~20개. prefix ~10–12K↓
   × N턴 = task당 cacheRead 수십만 토큰↓.
2. **(선택) 동적 노출:** 이미 존재하는 intent routing(weave WI / HANDOFF-027)에 도구 노출을
   연동 — task 의도별 관련 도구만 advertise. 효과 더 크나 설계 필요.
3. **(병행) 스키마 description 슬림화:** 장황한 description 압축 — 도구 수 유지하며 prefix↓.

## 측정 회신

구현 후 small-think DR-046 텔레메트리(task-cost의 cacheRead/cacheWrite + turn/tool 분포)로
before/after 재측정 → 결과를 small-think DR-067 후속/회신 핸드오프로 기록.

— 근거 전문: `workspace/small-think/records/decisions/DR-067-input-token-cost-is-prefix-times-turns.md`
