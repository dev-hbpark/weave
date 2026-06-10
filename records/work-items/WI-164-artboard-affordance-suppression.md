# WI-164 — 아트보드 잔여 어포던스 제거 (썸네일 호버 이펙트 + 페이지 선택 QuickActionBar)

- **Status**: DONE
- **Date**: 2026-06-10
- **Origin**: 사용자 리포트 2건 (WI-163 후속)
  1. "하단패널 썸네일 호버시에 편집영역에서의 호버이펙트 표시는 프레젠테이션 모드에서는 처리하지 않아야할거같아"
  2. "프레젠테이션 모드에서 페이지선택시 퀵앤션메뉴도 필요가 없어보여"
- **Parent**: WI-163 (page-bounded 아트보드 제약 모델)

## Problem

WI-163은 아트보드(= page-bounded 모드의 root-직속 프레임)를 "편집 컨텍스트이지
조작 대상이 아니다"로 정의하고 선택·핸들·이동·삭제를 차단했지만, 두 어포던스가
남아 있었다:

1. **호버 이펙트**: 하단 레일 썸네일은 `data-frame-id`를 캔버스 프레임과 공유하므로
   `useHoverContext`가 썸네일 호버를 페이지 호버로 보고, 캔버스의 페이지 본체 위에
   `HoverAffordanceLayer`를 칠했다. 캔버스에서 페이지 본문을 직접 호버해도 동일.
2. **QuickActionBar**: Cmd/Ctrl 딥클릭(탈출구)으로 페이지를 선택하면 contextual
   toolbar(페이지 채움 편집 — 의도된 것)와 함께 QuickActionBar(insert/lock/delete —
   아이템 전용 액션)도 마운트됐다.

## Decision

아트보드는 root와 동급으로 취급한다 — "페이지 전체를 틴트하는 것은 캔버스 전체를
틴트하는 것과 같은 노이즈"(2026-05-27 프로젝터 스코프 결정의 확장).

1. **프로젝터 입력 확장** (`hover-affordance-projector.ts`):
   `artboardIds?: ReadonlySet<string>` 추가. (a) hoveredId가 아트보드면 EMPTY 반환,
   (b) parent 티어에서 root와 동일하게 스킵. 미전달/빈 셋(무한 캔버스)이면 기존과
   수학적으로 동일 — mixed flavor 회귀 불가능.
2. **DesignPage**: `isArtboardId` 콜백과 같은 술어를 데이터 형태로 쓰는 memoized
   `artboardIds` 셋 추가(무한 캔버스 → 빈 셋), `HoverAffordanceMount`에 전달.
3. **QuickActionBar 게이트**: `QuickActionBarAnchored`의 `selectedFrameId`를
   `!isArtboardId(...)` 조건으로 undefined 처리 — 페이지 선택 시 contextual
   toolbar만 남는다.

## Verification (SVL)

- 프로젝터 유닛 17/17 (신규 4: 아트보드 호버 → EMPTY / 자식 호버 시 parent 티어
  스킵 / 손자는 비-아트보드 부모 유지 / artboardIds 미전달 = WI-040 모델 불변).
- 풀 vitest 981/981, tsc clean, biome clean, 구조 게이트 4종 green.
- e2e `page-artboard.spec.ts` 7/7 — 신규 2: 레일 썸네일 호버 → 호버 레이어 0개
  (+ 페이지 내부 아이템 호버는 여전히 동작하는 sanity), 페이지 선택 →
  `hover-quick-actions` 0개 + `contextual-toolbar` 표시.

## Regression triage — 3건 실패는 기존 결함 (banner overlap)

`hover-affordance.spec.ts:58,:87` + `mode-gate-hardening.spec.ts:110` 실패는
WI-164와 무관함을 입증:

- 세 spec 모두 `flavor: "mixed"` → `artboardIds`가 빈 셋 → 프로젝터 변경은 no-op.
- 실패 스크린샷: 캔버스 좌상단(spec 프레임 위치 x:0.1,y:0.1)이 런치 배너 2종
  ("Text editing is upgraded", "Frame selection is upgraded") + Aku 코치마크
  ("아쿠에게 맡겨보세요")에 덮여 mouse.move가 배너에 떨어짐.
- 원인 메커니즘: `clearAllDesigns`(helpers.ts)가 `weave.*` 키 전부를 지우므로
  배너 dismissal 키(`weave.launch.*.dismissed-at`, `weave.coachmark.aku-intro`)도
  매 spec마다 리셋 → 배너가 항상 fresh로 뜬다.
- **결정적 증거**: :58 테스트 본문을 그대로 복제하고 dismissal 키 3종만 미리
  세팅한 임시 spec → PASS (5.7s). 동일 본문이 배너 유무로만 pass/fail이 갈린다.
- 후속 제안: helpers의 `clearAllDesigns`(또는 `prepareDesign`)에서 dismissal 키를
  기본 세팅하면 세 spec이 치유된다. 별도 슬라이스로 분리(이 WI 범위 밖).

## Files

- `apps/web/src/document/render/hover-affordance-projector.ts`
- `apps/web/src/document/render/hover-affordance-projector.test.ts`
- `apps/web/src/pages/DesignPage.tsx`
- `apps/web/e2e/page-artboard.spec.ts`
