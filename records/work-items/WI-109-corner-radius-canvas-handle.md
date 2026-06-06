# WI-109 — 피그마식 캔버스 곡률 핸들 (균일 그립 + 더블클릭 per-corner 분할/병합)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-076 (builds on DR-075 / WI-108) |
| Relates | chart-element-view-model(핸들 패턴) · weave.shape.setCornerRadius(도형 per-corner) · WI-031(곡률 직접드래그 — 본 WI로 구현) |

## Problem (operator, 2026-06-06)

피그마처럼 **오른쪽위 핸들**을 캔버스에 추가. 핸들 **더블클릭 → 네 모서리에 핸들이 생겨 개별
조정**, 다시 **더블클릭 → 하나로 합쳐지며 더블클릭한 모서리 값으로 전체 동일 세팅 + 오른쪽위
핸들만 노출**. 전체 객체(도형/프레임/이미지/비디오) 포함, **툴바 곡률 컨트롤은 제거**.

## Change (DR-076)

- `corner-radius.ts` — per-corner 헬퍼(`CornerRadii`, `uniformRadii`, `isUniformRadii`,
  `cssBorderRadius`, `mediaBorderRadius`, `perCornerRectPath`).
- `corner-radius-adapters.ts` (신규) — per-kind read/write(Rule 6): 프레임/이미지/비디오는
  스칼라+옵셔널 튜플(`weave.item.update`), 도형은 `weave.shape.setCornerRadius`.
- `corner-radius-mode.ts` (신규) — ephemeral uniform/split 모드 스토어.
- `selection-chrome/corner-radius-handle.tsx` (신규) — `createCornerRadiusViewModel`
  (frame/image/video/shape 등록) + 자가-위치 포털 그립. 줌/회전은 `offsetWidth`+AABB+회전으로
  요소에서 직접 계산. 드래그=inward 대각선 투영→반지름, 더블클릭=split/merge.
- 렌더: `FrameBlock`(튜플 시 `<path>` per-corner, 아니면 `<rect rx/ry>`), `ImageBlock`/
  `VideoBlock`(CSS 4-value border-radius). 도형은 기존 path.
- `handle-gesture-runner.ts` — `corner-radius-drag` 종류 등록.
- `use-selection-chrome-registry.ts` — 4개 kind에 VM 등록.
- `types.ts` — `FrameAttrs.cornerRadii?`. 이미지/비디오 `borderRadii`는 `onUnknown:preserve`로
  보존(스키마 무변경).
- 제거: `corner-radius-field.tsx` 삭제, shape-section `CornerRadiusControl` 제거.

## Acceptance

- [x] 선택 시 오른쪽위(균일) 그립 1개. 드래그 → 네 모서리 동일 곡률(절대 px, 짧은변 클램프).
- [x] 그립 더블클릭 → 4분할, 모서리별 그립 개별 드래그.
- [x] per-corner 그립 더블클릭 → 그 모서리 값으로 전체 균일 + 오른쪽위 1개로 복귀.
- [x] 도형/프레임/이미지/비디오 모두 동작. 회전 객체도 그립이 시각적 모서리에 위치.
- [x] 툴바 곡률 컨트롤 제거(편집은 캔버스 핸들 유일).
- [x] 모든 쓰기 History 1스텝(undo). 기존 문서 무마이그레이션(추가형 필드).
- [x] 검증: 단위 681 통과(`corner-radius`/`corner-radius-adapters`/제스처 레지스트리), e2e
  `corner-radius-handle.spec.ts` 라이브 통과(드래그·분할·개별·병합). typecheck/biome/build 그린.

## Aku 에이전트 경로 동기화 (점검 결과)

런타임 배선은 정상(에이전트 → `weave.item.update`/`weave.shape.setCornerRadius` → 렌더, 핸들과
동일 경로). 단, 에이전트 **안내 텍스트**가 DR-075 px 전환 후에도 옛 `0..1 비율`로 남아 LLM이
분수 값을 넣으면 ~0px로 렌더되는 disconnect 발견 → 수정:
- `weave-command-schemas.ts` FRAME/IMAGE 노트 + 도형 setCornerRadius 주석: `0..1` → **절대 design-px**(+ per-corner 언급).
- `weave-capabilities.ts` frame/image/video 곡률 설명: px로 정정, editableAttrs에 `cornerRadii`/`borderRadii` 추가.
- 검증: e2e `corner-radius-agent-path.spec.ts` — 에이전트식 `weave.item.update`로 `borderRadius:40`→`40px`,
  `borderRadii`→`30px 10px 5px 0px` 렌더 라이브 통과. 에이전트 테스트 41 + 전체 681 그린.

## Notes / Deferred

- 회전 그립 위치는 요소 기하(AABB+offsetWidth) 기반으로 카메라 미의존 — 비정상 transform에서
  미세 오차 가능(실사용 영향 미미).
- `frame-handles.spec.ts`(canvas-board 리사이즈)는 본 WI와 무관하게 이 환경에서 사전 실패
  (VM 비활성화해도 동일) — 별도 플레이크.
