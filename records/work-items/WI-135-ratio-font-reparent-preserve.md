# WI-135 — 폰트크기 kind 이슈: 부모프레임 이동(reparent) 시 비율 폰트 시각 크기 보존

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-086 |
| Relates | DR-082(px↔ratio 매그니튜드 가드) · agocraft `resolve-font-size` · `reparent-font.ts` |

## Problem (operator, 2026-06-07)

"비율과 폰트 방식의 부모프레임이동 동작에 문제없는지 검사" → 검사 결과 **버그 확인**.
`fontSizeSpec.kind:'ratio'` 는 `value × 부모높이` 로 렌더되는데, `weave.item.reparent` 는
박스(on-screen 크기)는 보존하면서 폰트는 변환하지 않음. 키 높이가 다른 부모로 옮기면 비율
폰트만 점프(A h0.25→B h0.5 에서 54px→108px), px 폰트는 정상. reparent 계약("위치 보존")과
충돌하는 박스↔폰트 불일치.

## Change (weave-only, agocraft 재벤더 없음 — DR-086)

**v2 (operator follow-up "raw … 도 재기준화"): 명령 자체를 래핑 → 모든 경로 커버.**

- 신규 `apps/web/src/document/reparent-font.ts`:
  - `computeRatioFontReparentUpdates(doc, entries)` (순수) — `newValue = oldValue × oldParentH/newParentH`
  - `ratioFontReparentPatches(doc, entries, basePatches)` — kit reparent 의 base 패치에 덧붙일
    `item.attrs` 패치 생성. 옮긴 아이템의 **최종 attrs**(layout 부모면 fullAttrsPatch.after,
    아니면 reparent entry 의 newFrameRatio)를 읽어 `fontSizeSpec` 만 바꿈 → frame 클로버 없음,
    self-invert, 단일 트랜잭션.
- `commands.ts`: `weave.item.reparent` 를 weave 래퍼로 등록 — kit run 호출 후 폰트 패치 append.
  **UI 제스처·아쿠 에이전트 tool path·프로그램 exec 모두 동일하게 커버.**
- `agocraft-mirror.ts`: `frameHeightRatio(doc, frameId)` export.

## Acceptance

- [x] 단위 `reparent-font.test.ts` 3 pass (re-base 수식 · px 무시 · 동일높이 no-op)
- [x] e2e `fontsize-reparent.spec.ts` 3 pass: **raw 명령**이 ratio(54→54)+px(30→30) 보존,
      단일 Cmd+Z 가 부모+value 0.2 복원, **에이전트/프로그램 raw-exec 경로도 보존**
- [x] weave typecheck 0, 회귀 없음(기존 reparent e2e + commands.test)
- [x] WI-133 레이아웃 테스트의 기존 `childConstraints` 타입오류도 함께 수정

## 남은 범위

`dissolveFrame`(프레임 삭제→자식 상승)은 별도 제스처라 래핑 안 함(기존 동작 유지). 필요 시 후속.
