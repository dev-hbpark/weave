# WI-216 — flex 자식 텍스트 높이: 엔진 cross-axis 소유 (fill/fixed/auto), observer 비간섭 (DR-053 Stage 2)

- **Status:** IN-PROGRESS (observer 게이트 DONE, 토글/content-auto 토글 follow-up) · 2026-06-13
- **Relates:** DR-053(레이아웃 크기변화 엔진 단독소유), WI-215(높이 ratchet — 선행), WI-149/DR-104, WI-145/146(observer revert 이력)
- **Origin:** 운영자 — grid→flex→text에서 ① 플렉스 높이를 줄이면 텍스트 높이가 보장되지 못하고 줄어듦
  (fill이면 항상 가득, fixed면 자기 높이 유지여야 함) ② 텍스트 자동높이/자동너비/고정 속성을 바꿔도
  자동으로 다시 자동높이로 되돌아감. 운영자 모델: "부모 레이아웃이 자식에게 변화를 전파(fill)할지,
  자식 높이에서 멈출(fixed)지 선택 가능해야 한다."

## 루트 (둘 다 같은 뿌리)

weave `TextBlock` auto-height observer가 `deriveTextAutoResize(layoutChild)="HEIGHT"`로 무조건
`frame.height`를 써서 **agocraft 엔진의 cross-axis 정책을 덮어씀.** 엔진은 이미 3모드 지원:
- **fill** = `alignSelf:"stretch"` → 엔진이 availableCross로 채움(부모 전파).
- **fixed** = non-stretch + `crossSize:N` → 엔진이 N 유지(자식 높이에서 멈춤).
- **auto** = non-stretch + `crossSize` 부재 → 엔진이 `frame.height`(콘텐츠) 추종.
그런데 observer가 그 위에 덧써서 fill/fixed 불가. 그리고 토글이 `layoutChild=absolute-constraints`를
써서 flex relayout이 auto-flex로 재스탬프 → `deriveTextAutoResize`가 다시 "HEIGHT" → 되돌아감.

## 구현 — observer 게이트 (DONE, weave-only, 재-vendor 불요)

- `parent-frame-context.ts`: `ParentLayoutContext`(부모 프레임의 LayoutSpec) 추가.
- `NestedFrame.tsx`: 자식들에게 자기 `attrs.layout`을 ParentLayoutContext로 provide.
- `TextBlock.tsx`: 부모 레이아웃을 읽어 **높이가 레이아웃-지배(flex-ROW에서 alignSelf stretch=fill,
  또는 crossSize 존재=fixed)면 `frame.height` 미기록** → 엔진이 높이 소유. content-auto(non-stretch+
  crossSize 부재)에서만 observer가 fit. (flex-row 한정 스코프, 다른 레이아웃 무변경.)
- 검증: tsc/biome 클린, weave document 999 그린.
- **효과:** fill(flex-child-section "자기 정렬: Stretch") / fixed(Start/Center, crossSize 유지)가
  엔진에 의해 정상 동작. **라이브 검증 필요(observer=revert 빈발 영역).**

## Follow-up (남음)

- 증상②의 토글 정리: flex 자식에서 text-section의 자동너비/자동높이/고정(absolute-constraints) 컨트롤은
  덮이므로, flex 자식 전용으로 **cross 정책(stretch/crossSize/clear)** 을 쓰도록 변경 or 숨김 + content-auto
  (crossSize 제거) 컨트롤 제공. text-section은 렌더트리 밖이라 부모 레이아웃을 doc에서 찾아야 함.
