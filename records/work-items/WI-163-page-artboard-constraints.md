# WI-163 — page-bounded 모드의 페이지 = 아트보드 (캔바식 페이지 제약)

Status: **Done**
Owner: hbpark
Updated: 2026-06-10

관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(page-bounded 편집 본체) ·
[DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md) ·
DR-061(아이템 잠금 — 게이트 패턴 선례) · WI-033(Figma 선택 모델 — parent-first) ·
플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md`

## Problem (사용자 보고)

> 현재 프레젠테이션 모드에서 페이지 핸들이 보이고 있어. 요구사항은 캔바나 미리캔버스의
> 편집처럼 페이지에 대한 제약이 적용되어야 해.

라이브 재현(SVL, 2026-06-10)으로 확인된 실태 — page-bounded(slide-deck) 편집에서 페이지
(최상위 프레임)가 **일반 아이템과 동일하게 조작 가능**:

1. 페이지 본문 클릭 → 페이지가 선택되어 **리사이즈/회전 핸들 + 컨텍스트 툴바** 노출.
2. 페이지 본문 드래그 → **페이지 자체가 이동** (재현: (0,0) → (0.102, 0.119)) — 아트보드가
   캔버스에서 어긋나고, WI-157 카메라 fit(FULL_FRAME 전제)·페이지 클립 전제와도 충돌.
3. WI-033 parent-first 선택 모델이 문서 root 기준이라, 페이지 **안의 아이템을 클릭해도
   첫 클릭은 페이지를 선택**(trail[0] = 페이지) — 핸들 노출의 주 경로.
4. 페이지 선택 상태에서 Backspace → 페이지 삭제 가능. Shift+Enter(drillUp)로 최상위
   아이템에서 페이지로 올라가고, Tab 형제 순환은 **숨겨진 다른 페이지들**을 선택.

캔바/미리캔버스의 모델: 페이지는 **고정 아트보드** — 변형 핸들 없음, 드래그 불가, 캔버스
제스처로 삭제 불가. 페이지 단위 조작(추가/복제/순서)은 레일 담당(weave도 이미 동일:
WI-153 P2.2 추가 + WI-155 복제).

## 결정 — 페이지를 "조작 가능한 객체"에서 "편집 컨텍스트"로

술어: **`page-bounded 모드 && 최상위(root 직계) 프레임` = 페이지(아트보드)**. 단일 술어를
기존 DR-061 잠금 게이트와 같은 지점들에 적용하되, 잠금과 달리 **모드 파생 동작 게이트**
(영속 attr 아님 — 사용자가 해제 불가, 복제·직렬화에 영향 0, mixed/canvas-board 불변).

| # | 표면 | 동작 |
|---|---|---|
| 1 | 클릭 선택 (`selectFromHit`) | **컨텍스트 루트 = 활성 페이지**: 페이지 본문 plain 클릭 = 배경(선택 해제), 아이템 클릭의 parent-first는 **페이지 안쪽 1레벨**부터 (페이지가 선택되는 일 없음). Shift-toggle로 페이지를 멀티셀렉트에 추가 불가 |
| 2 | 이동 제스처 (FrameMoveBinding `resolveTarget`) | 페이지 = 대상 거부(null) → 페이지 본문 드래그는 기존 P4 러버밴드(마키)로 폴스루 |
| 3 | 변형 핸들 (SelectionLayer) | 페이지가 선택된 경우에도(아래 escape hatch) DR-061 잠금 필터 재사용으로 **리사이즈/회전 핸들 미노출** (잠금 배지는 페이지엔 표시 안 함 — 잠금이 아니라 아트보드) |
| 4 | 리사이즈/회전 러너 게이트 | `isLockedItemId` 술어 확장(locked ‖ page) — 프로그램적 선택에도 변형 불가 |
| 5 | 삭제 (Backspace / deleter) | DR-061 잠금 필터와 동일하게 페이지 제외 — 페이지 삭제는 캔버스 제스처가 아니라 레일의 책임(현재 레일 삭제 UI 없음 — 별도 슬라이스) |
| 6 | 키보드 내비 | drillUp 결과가 페이지면 no-op; 현재 선택이 페이지면 형제 순환(숨겨진 페이지 선택) no-op. drillDown(페이지→첫 자식)은 유지 |

**Escape hatch (의도적)**: **Cmd/Ctrl-deep-클릭은 페이지 선택 허용** — 변형 핸들은 #3/#4로
계속 차단되지만 컨텍스트 툴바는 떠서 **페이지 배경(fill) 편집 경로가 보존**된다. 캔바도
페이지 배경 편집 UI를 제공하므로 이 경로를 완전히 끊으면 기능 회귀. plain 경로의 캔바
패리티와 fill 편집 보존의 절충. (후속: 페이지 배경 편집을 레일/페이지 크롬으로 옮기면
escape hatch 회수 가능.)

## 비범위

- 페이지 리사이즈(디자인 크기 변경) UI — 디자인 설정의 영역.
- 레일의 페이지 삭제 액션 — 별도 슬라이스.
- mixed / canvas-board(무한 캔버스) — 최상위 프레임은 일반 객체 그대로(불변).

## 구현 (2026-06-10)

| 게이트 | 위치 |
|---|---|
| #1 클릭 선택 | `selectFromHit`에 `contextRootId?` 5번째 인자 (`selection-context.tsx`): plain/toggle 히트가 아트보드면 null, 다른-컨텍스트 parent-first는 trail에서 아트보드 다음(안쪽 1레벨)부터. `NestedFrame`이 `artboardId` prop을 받아 재귀 전달 + toggle 게이트 + `null && target===artboard → onSelect(undefined)`(배경 클릭 = 선택 해제) |
| #2 이동 거부 | `FrameStage.movableTargetOrNull` — 아트보드면 null (러버밴드 폴스루) |
| #3 핸들 억제 | `NestedFrame` 크롬 필터 `applyLayoutConstraintFilter(specs, constraints, locked ‖ isArtboard)` — DR-061 잠금 필터 재사용(rotate/resize-* 제거, 비변형 spec 유지). 잠금 배지는 `locked`만 |
| #4 러너 게이트 | `FrameStage` rotate(1387)/resize(1474) onDown: `isLockedItemId ‖ isArtboardId` |
| #5 삭제 게이트 | `DesignPage` frameDeleter / multiDeleter / Backspace 필터에 `isArtboardId` 제외 |
| #6 키보드 내비 | navigator: `nextId`가 아트보드면 no-op (drillUp→페이지 차단 + 페이지에서 형제 순환 차단 — 형제도 페이지므로 단일 규칙으로 커버). drillDown 유지 |
| +α 화살표 너지 | escape-hatch deep 선택 상태에서 화살표가 페이지를 이동시키는 누수 발견 → nudge 대상에서 아트보드 필터 (결정표 외 추가 게이트) |

술어 구현 2곳 (각 파일의 stable-closure 제약 때문에 ref 기반 지역 헬퍼):
`FrameStage.isArtboardId` = `visibleFrameIdsRef` 정의됨 && root 직계;
`DesignPage.isArtboardId` = `!infiniteCanvasRef` && root 직계.

## 검증 (2026-06-10)

- **SVL (라이브, :5173)**: 5/5 — plain 클릭 → 선택 none / 본문 드래그 → frame 불변
  (0,0,1,1 유지) / Cmd-클릭 → 페이지 선택(escape hatch) but 변형 핸들 0(custom만 잔존,
  DR-061 잠금과 동일) / Backspace → 페이지 생존. 스크립트는 검증 후 삭제.
- **유닛**: `selection-from-hit.test.ts` +8 (artboard plain→null, parent-first
  안쪽 1레벨, in-context drill 불변, deep escape hatch, toggle→null,
  contextRootId 미지정 시 WI-033 모델 불변) — 26/26. 전체 977/977 green.
- **e2e (영구)**: `e2e/page-artboard.spec.ts` 4/4 — ① plain 클릭 해제 + 드래그
  불변 ② 페이지 안 아이템 클릭 = 아이템 선택(페이지 아님) ③ Cmd-클릭 escape
  hatch + 변형 핸들 0 + Backspace 생존 ④ mixed 회귀(최상위 프레임 핸들 표시 +
  드래그 이동 정상). 작성 중 잡은 함정: 레일 썸네일이 `data-frame-id` 공유
  (`:not([data-thumbnail-id])` 필요), launch 배너가 캔버스 상단 오버레이(시드
  y=0.4), mixed는 스타터 콘텐츠 시드(`children.at(-1)` 사용).
- **게이트**: tsc / biome / tokencheck / declarativecheck / puritycheck /
  inheritancecheck 모두 green.

## 후속 수정 (2026-06-10) — 마키 선택 페이지 누수 + 곡률 핸들 잔존

사용자 보고:

> 드레그로 선택되면 페이지에 곡률 핸들이 보여

원인 2개 (본체 슬라이스의 누락):

1. **마키가 페이지를 선택** — `FrameStage`의 MarqueeSelectionLayer `getFrames`가
   **최상위 프레임만** hit-test 후보로 반환. page-bounded에선 최상위 = 페이지뿐이라
   밴드가 항상 페이지와 교차 → 페이지가 선택됨 (마키로 페이지 *안* 아이템을 선택할
   방법 자체가 없었음 — 캔바 모델 위반 + 마키 무용지물).
2. **곡률(custom) 핸들 잔존** — #3 핸들 억제가 DR-061 잠금 필터
   (`applyLayoutConstraintFilter(..., locked ‖ isArtboard)`)를 재사용했는데, 잠금
   필터는 **비변형 spec(곡률 "custom" 핸들)을 의도적으로 유지**한다. 잠금 아이템엔
   맞는 의미지만 아트보드엔 누수.

수정:

1. `FrameStage` marquee `getFrames`: `activePage !== undefined`(page-bounded)면
   후보 = **활성 페이지의 직계 자식**(도메인 아이템), 프레임은 페이지 박스로 합성
   (`pageF.x + f.x * pageF.width`, ...). 페이지 회전은 아트보드 게이트가 0을 보장.
   infinite canvas 분기(`frames.map`)는 불변 — 기존 WI-039 dim/isolation 필터와
   회전-AABB px 매핑은 양 분기 공통 적용.
2. `NestedFrame` 크롬: 아트보드는 잠금 필터 경유 대신 **spec 전면 `[]`** — 변형
   핸들뿐 아니라 kind 핸들(곡률)까지 캔버스 핸들 0. 잠금 배지는 `locked`만 (불변).

검증: e2e `page-artboard.spec.ts` 5/5 — 신규 ④ "마키 드래그는 페이지 안 아이템을
선택, 페이지는 절대 아님" + ③ 강화(컨텍스트 툴바 가시화 앵커 후
`[data-handle-kind]` **총 0개** 단언 — 이전 앵커였던 "핸들>0 폴링"은 전면 억제로
무효). page-group-clamp 3/3 · multi-marquee-flow · rotation-hover-marquee-align
통과(마키 회귀 없음 — infinite 분기 no-op 확인), `marquee-select.spec.ts` 단독
실행 실패는 기록된 standalone networkidle 플레이크(멀티 스위트 통과). 유닛
977/977 · tsc · biome · 4 구조 게이트 green.
