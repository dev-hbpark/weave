# WI-216 — flex 자식 텍스트 높이: 엔진 cross-axis 소유 (fill/fixed/auto), observer 비간섭 (DR-053 Stage 2)

- **Status:** IN-PROGRESS ((a) observer 게이트 DONE · (c) 토글 영속 DONE — 라이브 검증 대기 · (b)/(d) 남음) · 2026-06-13
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

## 누적 요구 (운영자, 2026-06-13) — 하나의 기능으로 통합

레이아웃 내 텍스트 크기 = fill(전파) / fixed(멈춤) / auto(콘텐츠), 모든 방향, regrow 복원, 토글 영속.

- **(a) observer 게이트** — DONE(flex-row). 높이 레이아웃-지배면 frame.height 미기록.
- **(b) 방향 일반화** — flex-COLUMN(크로스=너비, auto-width observer)·grid(행/열 트랙)도 (a)와 동일하게.
- **(c) 토글/라벨 방향-인지(증상②③)** — DONE(라이브 검증 대기). 두 면 모두 수정:
  - **읽기**: `deriveTextAutoResize`가 auto-flex 자식 `crossSize` 존재 → "고정"(NONE), 부재 → "자동높이"(HEIGHT);
    auto-grid `sizeH|sizeW` 존재 → "고정". 라벨이 리사이즈 후 엔진이 스탬프한 crossSize를 읽어 **"고정"으로 sticky**
    (이전엔 무조건 "자동높이"로 되돌아감).
  - **쓰기**: 새 `layoutChildForTextResizeMode(mode, current, parentLayout, frame)` — flex/grid 자식이면
    레이아웃 정책 유지하고 cross 정책만 토글(고정=crossSize/sizeW·sizeH 스탬프, 자동높이=cross 제거,
    자동너비=basis "auto"+cross 제거). absolute-constraints 앵커를 쓰던 기존 경로(재스탬프로 되돌아가는 버그)를
    대체. free/absolute 텍스트는 기존 `layoutChildFromTextAutoResize` 폴백. text-section은 렌더트리 밖이라
    `batchPerItem`+`findParentAndIndex(doc,id)`로 자식별 부모 레이아웃 조회. (flex-row/col + grid 모두 처리 →
    (b)의 방향 일반화 상당부분 동반.) 검증: derive 테스트 17 그린, tsc/biome 클린.
- **(d) regrow 복원(제스처 베이스라인)** — 리사이즈 제스처 시작(새 sessionId)에 doc 스냅샷, 드래그 동안 그 스냅샷을 onFrameChanged의 root로 사용(누적 ratchet 제거, 마우스다운 크기로 복원), pointerup에 폐기. **(A) weave-fed 베이스라인**(엔진 무상태, 재vendor 불요) 권장 / (B) 엔진 begin/endResize 세션.

라이브 검증: 부모 줄였다 늘려 복원 / flex-col / grid / 고정 토글이 리사이즈 후에도 유지.

## Follow-up (남음)

- 증상②의 토글 정리: flex 자식에서 text-section의 자동너비/자동높이/고정(absolute-constraints) 컨트롤은
  덮이므로, flex 자식 전용으로 **cross 정책(stretch/crossSize/clear)** 을 쓰도록 변경 or 숨김 + content-auto
  (crossSize 제거) 컨트롤 제공. text-section은 렌더트리 밖이라 부모 레이아웃을 doc에서 찾아야 함.
