# WI-216 — flex 자식 텍스트 높이: 엔진 cross-axis 소유 (fill/fixed/auto), observer 비간섭 (DR-053 Stage 2)

- **Status:** IN-PROGRESS ((a)/(c) DONE·검증됨 · (b) 엔진-소유 재구현 DONE — **grid 셀 fill + 자동높이 부모리사이즈 유지(content-auto 0-ratchet FIX 포함) 라이브검증됨 2026-06-13**, 잔여(flex-col·자동높이 줄추가 성장·고정 토글) 검증대기 · (d) regrow 엔진 세션 DONE — regrow 검증대기) · 2026-06-13
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
- **(b) 방향 일반화** — DONE(라이브 검증 대기). 핵심 통찰: laid-out 자식의 `deriveTextAutoResize`는
  NONE/HEIGHT만 반환(WIDTH_AND_HEIGHT 불가) → observer의 width 분기는 laid-out 자식에 절대 안 탐 →
  **HEIGHT 분기만 게이트 필요**. 누락된 케이스 = **grid**: 기본 spec `align:"stretch"`라 sizeH 없는 grid
  셀 텍스트가 HEIGHT 도출→observer가 높이 ratchet→0. 수정(`TextBlock.tsx` `heightOwnedByLayout`):
  auto-flex(row: stretch|crossSize) + **auto-grid(행축=높이: align(Self) stretch=fill | sizeH=fixed)**
  둘 다 처리. flex-COLUMN: 높이=MAIN축(basis/grow/shrink 지배, 크로스 fill/fixed 토글 무관)이라 observer
  콘텐츠-fit 유지(basis auto hug), 크로스=너비는 observer가 어차피 width 안 건드림(엔진 소유). 검증:
  document 1009 그린, tsc/biome 클린. (남은 한계: flex-column에서 grow>0/고정 basis로 MAIN(높이)을
  엔진이 채우는 경우는 크로스 개념 밖 — (d) regrow 세션에서 다룸.)
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
- **(d) regrow 복원(제스처 베이스라인) — DONE(옵션 B 엔진 세션, 라이브 검증 대기).** agocraft 엔진
  `beginResize`/`endResize` + `onFrameChanged`/`reflowSubtree`의 선택 `gestureId`. 제스처 첫 호출 때
  gestureId 최초 등장 시 root에서 subtree(frame+policy) 자동 스냅샷(=마우스다운 상태, 아직 미커밋), 캐스케이드가
  **누적 doc이 아닌 동결 baseline에서** rescale → 부모 축소→재확대가 마우스다운 크기로 복원. 새 제스처가 이전 세션
  evict. weave 와이어: `FrameStage.commitFrame`이 per-제스처 `sessionId`(editor FrameAccess)를
  `onCommitFrame(itemId,frame,sessionId)`로 → DesignPage가 `editor.exec("weave.item.update",{...,sessionId})`
  → item.update가 `onFrameChanged({gestureId:sessionId})`. engine.test +13(60), layout 271 그린.

- **🔑 (b) 엔진-소유로 전면 재구현 (운영자 지시 "텍스트블록에 레이아웃 로직 0, 엔진이 모두 처리") — DONE(라이브 검증 대기).**
  (a)/(c)에서 `TextBlock.heightOwnedByLayout`(부모레이아웃+정책 추론)·`text-section` cross 판정이 weave에 있던 것을
  전부 agocraft 엔진으로 이관:
  - 엔진 신규 `getContentAutoAxes({root,itemId})→{managed,width,height}` = fill/fixed/auto **단일 판정원**
    (`CONTENT_AUTO_AXES_BY_KIND`). `onContentMeasured({root,itemId,content})` = 측정 콘텐츠를 auto 축에만
    적용·**intrinsic 미스탬프**(auto가 fixed로 변환되던 버그 원천차단)·reflow. (agocraft 65e4ea8, layout
    rc.20260613210000, DR-053 Stage 2.)
  - weave: `ParentLayoutContext`+`heightOwnedByLayout` **삭제** → `ContentAutoAxesContext`(NestedFrame이
    text 아이템마다 `getContentAutoAxes` 호출해 제공) + `MeasureContentContext`(DesignPage가 editor-exec
    커밋fn 제공). `TextBlock`은 부울 `fitWidth/fitHeight`만 읽어 축별 observer 구동(레이아웃 추론 0); managed
    텍스트 커밋은 신규 `weave.layout.contentMeasured` 커맨드→엔진(스탬프 없음), free 텍스트만 기존 onUpdate.
    커맨드는 host-internal이라 양 에이전트 surface에서 de-list(NONCANONICAL) + 거버넌스 2게이트(스키마/triage) 갱신.
  - 검증: weave 1350 그린, tsc/biome 클린.

라이브 검증: 부모 줄였다 늘려 복원(d) / grid 셀 fill·고정 / flex-col / 고정 토글이 리사이즈 후 유지 / 자동높이 정상 성장.

## 자동너비 round-trip FIX (flex 자식, 2026-06-13 — 라이브 검증 대기)

운영자: flex-column에서 "자동너비"로 둔 텍스트가 컨테이너 가로 조정 시 다른 속성으로 바뀌고, 자동너비로 다시
설정 불가. **원인:** (c)의 `deriveTextAutoResize`(toolbar 읽기)가 auto-flex 자식을 `crossSize` 유무로만
NONE/HEIGHT 판정 → **WIDTH_AND_HEIGHT를 절대 반환 못 함** + 메인축(basis)·방향 무시. 쓰기도 cross-only라
메인축을 안 고정. **수정:** (1) 읽기 = toolbar가 엔진 `getContentAutoAxes`(방향/정렬 인지) → `contentAutoAxesToMode`
((T,T)/(T,F)=자동너비·(F,T)=자동높이·(F,F)=고정); free 텍스트만 `deriveTextAutoResize` 폴백. (2) 쓰기 =
`layoutChildForTextResizeMode` 2D 양축화(자동너비=양축 auto/자동높이=너비고정+높이auto/고정=양축고정), flex
방향에 맞춰 main(basis)/cross(crossSize) 매핑 → 엔진 읽기와 round-trip. derive 테스트 24 그린, weave 1016 그린.

## 폰트 스케일 + 렌더 떨림 (운영자 보고 2026-06-13)

- **flex-column 컨테이너 높이↑ → 텍스트 폰트 커짐 = 정상(운영자 확인).** `fontSizeSpec:{kind:"ratio"}`(%)
  폰트가 부모(컨테이너) 높이에 비례(DR-093 의도 동작). px로 두면 안 커짐.
- **폰트 커질 때 flex 레이아웃 렌더 떨림 FIX(라이브 검증 대기).** 원인=리사이즈 제스처 중 엔진 세션이 자식 크기를
  preserve-absolute로 동결(DR-053 (d))하는데, % 폰트가 매 프레임 컨테이너 높이 따라 커짐 → 텍스트 콘텐츠 높이↑
  → auto-height observer가 박스를 키우려 함 → 엔진 동결과 매 프레임 충돌 → 떨림. **수정=제스처 진행 중 observer
  fit 억제 후 끝나면 1회 재정착**(편집중 억제와 동일 패턴): `text-autofit-signal.ts`에 `isLayoutGestureActive()`/
  `markLayoutGestureActivity()`(commitFrame마다 마크 + 140ms 디바운스 종료→`requestTextAutofit()` 펄스),
  `TextBlock.measureAndCommit`이 활성 중 skip, `FrameStage.commitFrame`이 마크. weave-only, document 1016 그린.

## 자동너비/자동높이 + FILL(stretch) round-trip FIX (2026-06-13 — 라이브 검증 대기)

운영자: flex에서 자동너비 설정→자동높이로, 자동높이 설정→고정으로 바뀜(한 칸씩 내려감). **원인:** 3-모드 토글
(자동너비/자동높이/고정)에는 **FILL(stretch) 상태가 없음** — FILL은 별도(flex-child alignSelf stretch). 토글 쓰기가
stretch를 보존해서, 부모 `align:"stretch"`(또는 자식 alignSelf stretch)인 경우 엔진 `getContentAutoAxes`가
stretch 축을 **content-auto 아님**으로 읽음 → 모드가 한 칸 잘못 읽힘(자동높이 on stretch-cross→고정, 자동너비
on stretch-column→자동높이). 순수 write→read 로직은 align:start에선 정상이라 처음 못 잡음. **재현=새 통합테스트
`text-resize-roundtrip.test.ts`(실엔진 write→getContentAutoAxes 매트릭스, align stretch 2건 실패).** **수정:**
`layoutChildForTextResizeMode`가 3모드 중 어느 것도 FILL이 아니므로 effective cross align이 stretch면
`alignSelf:"start"`로 강제(비-stretch alignSelf는 보존) → 쓴 content/fixed 사이징이 실제 적용되고 round-trip.
roundtrip 18 + derive 25 + document 1035 그린.

## Follow-up (남음)

- 증상②의 토글 정리: flex 자식에서 text-section의 자동너비/자동높이/고정(absolute-constraints) 컨트롤은
  덮이므로, flex 자식 전용으로 **cross 정책(stretch/crossSize/clear)** 을 쓰도록 변경 or 숨김 + content-auto
  (crossSize 제거) 컨트롤 제공. text-section은 렌더트리 밖이라 부모 레이아웃을 doc에서 찾아야 함.
