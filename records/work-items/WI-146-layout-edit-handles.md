# WI-146 — 레이아웃 편집 핸들 (아이템 사이 드래그로 영역 분배 · 그리드 행/열 리사이즈·병합)

Status: **Done** (코드/단위 검증 완료 · 캔버스 드래그는 실환경 확인 권장)
Owner: hbpark
Updated: 2026-06-08
관련: WI-043(레이아웃 타입 피커 + TrackSizeEditor 입력폼, 핸들 드래그는 명시적 보류),
DR-design-019(드래그 핸들 out-of-scope "v1.1 manual remove + re-add only"),
선례 WI-109/DR-032(corner-radius 온캔버스 핸들 = 드래그→비율→exec(mergeKey) 패턴)
설계: [DR-design-030](../design-reviews/DR-design-030-layout-edit-handles.md),
엔지니어링: `features/layout-edit-handles/ENGINEERING_PLAN.md`

## Problem

레이아웃(flex/grid)을 선택했을 때 **아이템 사이에 핸들(선)** 을 띄우고, 그 선을 드래그해 레이아웃
속성값을 조절(영역 분배)하고 싶다. flex·grid 모두 지원하고, 그리드는 **행/열 크기 조정**과 **셀 병합**도
원한다. WI-043은 타입 피커 + 트랙 값 *입력 폼*까지만 만들고 드래그 핸들은 보류했었음(이 WI가 그 후속).

## Scope (3 증분, 순서대로)

1. **Flex gap/basis 드래그** — flex 컨테이너 자식 사이 선을 드래그 → `gap`(또는 경계 양옆 자식 `basis`)
   재분배. (가장 단순, 선례 거의 그대로)
2. **Grid 트랙 리사이즈** — 행/열 경계선 드래그 → 해당 `columns[i]`/`rows[i]` TrackSize 조정(이웃 트랙과
   비율 재분배).
3. **Grid 셀 병합** — `columnSpan`/`rowSpan` 조절(병합/해제). UI는 툴바 스텝퍼/토글(저위험) 우선,
   셀 모서리 드래그는 옵션.

## 가능성 결론 (조사 완료)

- **데이터 모델 준비됨**: flex `gap/grow/shrink/basis`, grid `columns/rows`(TrackSize fr/ratio/auto/minmax),
  `columnGap/rowGap`, `columnSpan/rowSpan`(=병합), `areas`.
- **커맨드**: `weave.frame.setLayout`(전체 스펙), `weave.item.setLayoutChild`(자식 정책)로 충분 —
  핸들이 현재 스펙을 read-modify-write 후 exec(mergeKey)로 1 undo. **신규 커맨드 불필요**(전체-스펙 경로).
- **핸들/드래그 인프라 준비됨**: `HANDLE_INTERACTIONS` + `dragGestureStates` + `startHandleGesture`,
  view-model `handles()` + 포털 그립(corner-radius 선례 동일).
- **그리드 트랙 기하**: `resolveTrackSizes`/`trackOffset`/`sumSpan`(@agocraft/core 공개)로 도출.

## Records (이 WI)

- 본 WI / DR-design-030 / `features/layout-edit-handles/ENGINEERING_PLAN.md`(SOLID·GRASP 체크 포함).

## Verification 계획

- 순수 기하/스펙-편집 로직은 **단위 테스트**(gap 재분배, 트랙 리사이즈 재분배, span 병합 클램프).
- 커맨드 경로는 setLayout/setLayoutChild 위임이라 기존 `commands-layout-relayout` 회귀로 커버 + 추가 케이스.
- ⚠️ 실제 캔버스 드래그(핸들 히트테스트/줌≠100%/모션)는 에이전트 무관 브라우저 검증 필요 — 샌드박스 한계,
  실환경 1회 확인 권장.

## Build (실제 구현)

- **순수 코어**(`selection-chrome/layout-handle-geometry.ts`, `layout-spec-edit.ts`):
  resolveTrackSizes(ratio/fr/auto), boundaryOffsets, trackStartOffset, projectPointer;
  setFlexGap(클램프), resizeGridTrackBoundary(쌍 보존·fr/auto→ratio), setGridSpan(클램프).
  단위 테스트 `layout-spec-edit.test.ts` **16/16**.
- **증분 1+2 핸들**(`selection-chrome/LayoutEditHandles.tsx`): frame kind view-model(코너radius 선례
  미러). 선택된 flex/grid 프레임에 자식/트랙 사이 드래그 선 포털. flex=gap, grid=열/행 트랙 리사이즈.
  `HANDLE_INTERACTIONS`에 `layout-line-drag` 등록, 드래그→`weave.frame.setLayout`. 레지스트리 등록
  (`use-selection-chrome-registry.ts`).
- **증분 3 병합**(`toolbar/sections/flex-child-section.tsx` GridChildSection): 열/행 병합 Select
  (columnSpan/rowSpan, clampSpan), `weave.item.setLayoutChild` 경유. 사용 가능 셀 ≤1이면 숨김.

## Verification

- typecheck(@weave/web) green, biome 클린(트리거-deps 등 사유 기재).
- 단위/통합: selection-chrome + commands + commands-layout-relayout + toolbar = **175 통과**(코어 16 포함),
  `HANDLE_INTERACTIONS` kinds 가드 갱신.
- ✅ **실환경 확인(2026-06-08)**: 1차 확인에서 그리드 트랙 선이 커서를 안 따라오는 어긋남 발견 →
  엔진 `resolveTrackSizes` 위임 + gap/2 오프셋 보정 + flex `(idx+0.5)` 보정 후 **재확인: 핸들이
  커서를 잘 따라옴**. (잔여: grow 자식 있는 flex의 미세 추종은 근사 — 필요 시 후속 보정.)

## 진행 로그

- 레코드 3종 → 순수 코어(테스트) → 증분1+2 핸들 → 증분3 병합. 증분별 커밋.
