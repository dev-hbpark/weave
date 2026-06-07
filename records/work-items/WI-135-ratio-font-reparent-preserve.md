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

- 신규 `apps/web/src/document/reparent-font.ts`:
  - `computeRatioFontReparentUpdates(doc, entries)` (순수) — `newValue = oldValue × oldParentH/newParentH`
  - `reparentPreservingRatioFont(editor, doc, entries, designSize)` — `editor.runBatch` 안에서
    reparent + per-ratio-text `weave.item.update`(post-reparent 상태 읽어 fontSizeSpec만 merge,
    frame 클로버 없음). 단일 undo.
- `agocraft-mirror.ts`: `frameHeightRatio(doc, frameId)` export (프레임 높이=design 분수).
- 제스처 2곳 배선: `use-reparent-drag-controller`(드래그-부모변경), `DesignPage`(레이어/컨텍스트메뉴).
- DEV 전역 `__weaveReparentPreservingRatioFont` (e2e 용).

## Acceptance

- [x] 단위 `reparent-font.test.ts` 3 pass (re-base 수식 · px 무시 · 동일높이 no-op)
- [x] e2e `fontsize-reparent.spec.ts` 3 pass: 제스처 reparent 가 ratio(54→54)+px(30→30) 보존,
      단일 Cmd+Z 가 부모+value 0.2 복원, 대조군(raw command)은 여전히 ×2
- [x] weave typecheck 0
- [x] WI-133 레이아웃 테스트의 기존 `childConstraints` 타입오류도 함께 수정

## 알려진 범위 (DR-086)

raw `weave.item.reparent`(아쿠 에이전트 tool path / 프로그램 호출)는 re-base 안 함 — 에이전트가
키 다른 프레임 간 비율 텍스트를 옮기는 경우는 드묾. 보편 수정은 agocraft attr 변환 훅 + 재벤더가
필요해 deferred.
