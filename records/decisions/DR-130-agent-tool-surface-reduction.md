# DR-130 — Aku 에이전트 도구 표면 축소 (page surface, 정규 funnel 정렬)

- **Date:** 2026-06-13 · **Status:** Accepted · **WI:** WI-205
- **Relates:** DR-115/WI-168(AgentSurfacePolicy closed allow-list), DR-064(FREE=all 유지), small-think DR-067/HANDOFF-028(입력토큰 분해 → 도구 표면이 최대 미탐색 prefix)
- **In:** HANDOFF-028 (from small-think) · **Out:** HANDOFF-029 (to small-think, 측정 회신 요청)

## Context

small-think DR-067 라이브 측정: Aku 입력 토큰의 96%가 cacheRead이고 ≈ **턴 수 × 정적 prefix**.
prefix에서 가장 크고 손대지 않은 덩어리가 **page surface가 광고하는 ~46개 도구 스키마(~19.5K
토큰, 매 턴 재독)**였다. turns는 본질적 비용(DR-048)이라, 곱셈의 다른 축인 prefix가 유일하게
열린 레버.

## 측정 (도구별 스키마 토큰 무게, vitest 프로브)

- 광고 스키마 합 **19,525 tok / 46 도구**. 분포가 극단적으로 치우침:
  상위 3개 `item.add`(4,136) + `items.update`(3,933) + `item.update`(3,753) = **61%**.
  나머지 43개 = 긴 꼬리(개당 50~360 tok).
- 도메인 지식 prose(`weave-capabilities.ts §6`)가 이미 **정규 funnel**을 선언하고 있었다:
  단일 스타일 → `item.add`/`item.update`(units), "`setFill`/`setCornerRadius`/`setVertices`/
  `setDecoration` 는 존재하지 않음"; 멀티 → `items.update`/`items.lifecycle`, "`items.align`/
  `resizeMulti`/`remove`/`duplicate` 쓰지 마라(흡수됨)". → 이 비정규 도구들이 **prose가 이미
  쓰지 말라는데도 광고되어** 매 턴 재독되고 있었다 = 순수 낭비.

## Decision

`PAGE_AGENT_SURFACE` allow-list에서 **비정규/니치/파괴적 19개를 de-list**(코드 등록은 유지 —
UI/단축키 불변, 에이전트만 못 봄). `PAGE_EXCLUDED`(coverage test)에 사유와 함께 이동(DR-115의
명시적 triage 메커니즘). **`items.update`/`items.lifecycle`는 유지** — align/distribute 등 고유
기능을 담은 정규 bulk 경로라 제거 시 기능 손실 + funnel 붕괴(28% cut은 이걸 자르는 전제였으므로
철회). 모든 제거 verb는 유지된 정규 도구로 도달 가능:

- (a) 비정규 단일 스타일: `shape.setFill`/`setCornerRadius`/`setVertices`/`item.setDecoration`
  → `item.update`(units). de-list로 prose의 "존재하지 않음" 문장이 *참*이 됨.
- (b) 비정규 멀티: `items.resizeMulti`/`items.remove`/`items.duplicate`/`items.duplicateWithDelta`
  → `items.update`/`items.lifecycle`.
- (c) 니치 shape/line/image: `image.setCrop`(→update attrs.cropRatio)·`item.flip`(→update
  transform.flip unit)·`shape.breakToLine`·`line.closeToShape`.
- (d) 상대 z ±1: `item.bringForward`/`sendBackward` → to/Front, to/Back.
- (e) 그리드/플렉스 마이크로: `item.swapGridCells`/`dropGridCell`/`swapFlexOrder` →
  `item.setLayoutChild`/`frame.setLayout`/`design.reorderChildren`.
- (f) `frame.removeKeepingChildren` — 니치 + page에서 파괴적(페이지=프레임, dissolve 시 자식이
  root로 유출). UI 전용.
- (g) `doc.reset` — 전체 문서 리셋, 에이전트에 줄 기능 아님(footgun). UI 전용.

**capabilities prose 정합 (HANDOFF-028 "3"):** 트림 후 고-트래픽 funnel 문장(§6)이 page에서
이미 정확해졌고(능동적 오안내 소멸), 남은 page/free 불일치는 `WEAVE_CAPABILITIES`의 **사용빈도
0 니치 절 6개**(swapGridCells/dropGridCell/breakToLine/closeToShape/setCrop/flip 언급)뿐이었다.
이 6개를 위해 635행 hand-tuned 파일을 flavor별로 포크/파라미터화하는 것은 워크스페이스의
"중복 금지·composition" 원칙 대비 부채만 크다 → **단일 소스 유지 + 니치 절을 정규 도구 기준으로
일반화**(page 정확, free는 도구 유지·prose 힌트만 제거). 본격 flavor-fork는 향후 필요 시.

## 트레이드오프 / 결과

- (+) 광고 스키마 **19,525 → 16,973 tok (−13%, −2,552)** / 46 → 27 도구. cacheRead ≈ ×턴수라
  page surface task의 입력 토큰 직접 절감.
- (+) 인간 기능 손실 0(커맨드 등록 유지), prose 정합(funnel 문장이 *참*이 됨).
- (−) 큰 절감(상위 3개의 61%)은 손대지 못함 — 그 무게는 `item.add`/`item.update`/`items.update`가
  **동일한 거대 frame/text/sizing 노트를 3중 중복** 보유한 데서 옴. 다음 레버는 **노트 dedup
  (description-slim)** — 단 DR-048이 그 노트들이 레이아웃 오용을 막는다고 했으므로 품질 회귀
  주의하며 별도 WI로.
- (−) FREE(mixed/canvas-board)는 DR-064대로 `tools:"all"` 유지 — 이번 축소는 page surface 한정.
  *→ 이 부분은 DR-132(2026-06-13)가 확장: 실사용 세션이 전부 free-placement로 확인되어 같은
  19개 de-list를 `{ allExcept }` 정책 변형으로 free에도 적용.*

## Verification

- `agent-surface.coverage.test.ts` 그린(7) — 모든 등록 커맨드 triage(등재 OR 제외) 완전.
- `weave-capabilities.coverage.test.ts` 그린(10) — prose 편집 후 무회귀.
- aku/agent + editor-mode 스위트 294 그린, `tsc --noEmit` 클린.
- 스키마 무게 프로브(임시, 제거됨): 19,525→16,973 tok / 46→27 도구 실측.
- 라이브 광고 수 확인: `import.meta.env.DEV` 시 connect 로그 `[aku connect] tool surface frozen
  at connect {count}` 가 27 부근(빌트인 design.snapshot/capabilities 제외).
- 효과(턴/토큰 before/after)는 small-think DR-046 텔레메트리로 재측정 → HANDOFF-029.

## Links

- `apps/web/src/document/editor-mode/pieces/agent-surface.ts` (PAGE_PASSTHROUGH_TOOLS)
- `apps/web/src/document/editor-mode/agent-surface.coverage.test.ts` (PAGE_EXCLUDED + 사유)
- `apps/web/src/features/aku/agent/weave-capabilities.ts` (니치 절 일반화)
- small-think DR-067 · HANDOFF-028 · HANDOFF-029
