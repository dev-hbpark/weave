# DR-076 — On-canvas corner-radius handle (uniform grip + double-click per-corner split/merge)

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-109
- **Builds on:** DR-075 (absolute-px circular corner-radius model).
- **Relates:** `selection-chrome/corner-radius-handle.tsx` (new VM + grips),
  `corner-radius-adapters.ts` (new, per-kind Rule-6 registry), `corner-radius-mode.ts` (new,
  ephemeral split/uniform store), `corner-radius.ts` (per-corner helpers + `perCornerRectPath`),
  `domains/FrameBlock.tsx` (per-corner SVG path), `domains/ImageBlock.tsx` / `VideoBlock.tsx`
  (4-value CSS border-radius), `selection-chrome/handle-gesture-runner.ts` (`corner-radius-drag`
  kind), `pages/design/hooks/use-selection-chrome-registry.ts` (registration), `types.ts`
  (`FrameAttrs.cornerRadii`). Toolbar controls REMOVED (`corner-radius-field.tsx` deleted;
  `CornerRadiusControl` dropped from shape-section).
- **Operator directive (2026-06-06):** 피그마처럼 오른쪽위 핸들 추가. 핸들 더블클릭 →
  다른 모서리에도 핸들이 생겨 개별 조정. 다시 더블클릭 → 하나로 합쳐지며 **더블클릭한 위치의
  값으로 전체 동일 세팅**되고 **오른쪽위 핸들만** 노출. (전체 객체 포함, **툴바 컨트롤 제거**.)

## Context

DR-075 가 곡률을 절대-px·원형·짧은변 클램프로 통일했고, 편집은 툴바 슬라이더뿐이었다. 운영자는
Figma식 캔버스 직접 조작 + per-corner 분할을 원했고, 곡률 편집을 캔버스 핸들로 **일원화**(툴바
제거)하기로 했다. 도형은 이미 per-corner(`subAttrs.cornerRadii`)였고, 프레임/이미지/비디오는
균일 스칼라뿐이라 per-corner 저장을 더해야 했다.

## Decision

### D1 — 데이터 (추가형, 마이그레이션 없음)
프레임/이미지/비디오에 **옵셔널 per-corner 4-튜플**을 추가: 프레임 `cornerRadii`, 이미지/비디오
`borderRadii`(둘 다 절대 design-px). 렌더러는 튜플이 있으면 per-corner, 없으면 기존 스칼라
fast-path. 도형은 기존 `subAttrs.cornerRadii` 그대로. 이미지/비디오 튜플은 agocraft 스키마에
없지만 `onUnknown:"preserve"`가 known-kind의 unknown attr을 보존하므로(storage.ts 주석에 명시)
라운드트립 생존 — agocraft 스키마 변경 불필요.

### D2 — 모드 (ephemeral, 데이터 파생 기본값)
"uniform"(그립 1개, 오른쪽위) vs "split"(그립 4개)은 **transient UI 상태**(`corner-radius-mode.ts`,
crop 모드와 동급). 기본값은 데이터 파생(비균일 radii → split)이라 per-corner 문서를 다시 열면
4그립으로 시작. 값 자체는 attrs에 영속.

### D3 — 핸들 (chart-element-view-model 패턴 차용)
`createCornerRadiusViewModel`을 frame/image/video/shape에 등록(priority 20, 리사이즈 chrome 위에
머지). freeform 앵커를 화면 밖에 두고, 자가-위치 포털 그립을 `document.body`에 렌더(rAF 추적).
**줌·회전은 요소에서 직접 계산**: `offsetWidth/Height`(스케일 안 된 design-px) + AABB
`getBoundingClientRect` + frame 회전으로 zoom·회전 코너를 풀어, 카메라 의존 없이 임의 각도 지원.
그립은 모서리에서 안쪽 대각선으로 반지름만큼 inset(최소 16px 그랩). 드래그 = 포인터의 inward
대각선 투영 → 반지름(짧은변 절반 클램프).

### D4 — 분할/병합 (요구 정확히)
- 균일 그립 더블클릭 → split: 4-튜플 시드 + 모드 split → 그립 4개.
- per-corner 그립 더블클릭 → merge: **그 모서리 값으로 전체 균일 세팅**(스칼라 set + 튜플 제거,
  도형은 `setCornerRadius{radius}`) + 모드 uniform → **오른쪽위 그립만**.
드래그 쓰기는 per-kind 어댑터(Rule 6, `corner-radius-adapters.ts`)로 — 프레임/이미지/비디오는
`weave.item.update` patch, 도형은 `weave.shape.setCornerRadius`. 모든 쓰기가 커맨드 → History
1스텝(mergeKey 폴딩).

### D5 — 렌더 per-corner
- 프레임: 튜플 있으면 `<path>`(per-corner, 화면-px 투영 + 짧은변 클램프, 도형과 동형 path),
  없으면 기존 `<rect rx/ry>`. clip rect도 동일.
- 이미지/비디오: CSS 4-value `border-radius`(브라우저가 모서리별 클램프+원형).
- 도형: 기존 path 그대로.

### D6 — 툴바 제거
`corner-radius-field.tsx` 삭제(이미지/비디오/프레임 슬라이더), shape-section의
`CornerRadiusControl` 제거. 곡률 편집은 캔버스 핸들이 유일 경로.

## Consequences

- 곡률을 캔버스에서 직접(Figma식), per-corner 분할/병합 가능. 기존 문서는 per-corner 필드가
  없어 균일 렌더 그대로(무마이그레이션).
- 회전된 객체도 그립이 시각적 모서리에 위치(요소 기하로 계산).
- 검증: 단위 `corner-radius.test.ts`(per-corner 헬퍼) · `corner-radius-adapters.test.ts`(어댑터
  read/write) · 제스처 레지스트리 테스트 갱신 — 전체 681 통과. e2e
  `corner-radius-handle.spec.ts`: 드래그 균일 곡률 → 더블클릭 4분할 → tl 개별 드래그 발산 →
  더블클릭 병합(전체=tl, 오른쪽위 1개) **라이브 런타임 통과**. typecheck/biome/build 그린.
- 회전 그립 위치는 요소 AABB+offset 기반(카메라 미의존). 단점: 비정상 transform 체인에서 약간의
  오차 가능(실사용 영향 미미).

## Alternatives rejected

- **모드를 데이터 presence로** — 도형은 튜플이 항상 있어 균일/분할 구분 불가. ephemeral 모드 +
  데이터 파생 기본값으로 통일.
- **per-item agocraft Migration으로 per-corner 추가** — 크기 비의존이라 가능하나 스키마 변경 +
  cross-project. `onUnknown:preserve`로 추가 attr만으로 충분.
- **FrameStage capture 디스패처에 corner-radius 종류 추가** — 그립이 `startHandleGesture`를
  직접 호출(chart 패턴)하므로 디스패처 수정 불필요.
