# Engineering Plan — 레이아웃 편집 핸들 (WI-146)

관련: [WI-146](../../records/work-items/WI-146-layout-edit-handles.md) ·
[DR-design-030](../../records/design-reviews/DR-design-030-layout-edit-handles.md) ·
선례 WI-109/DR-032(corner-radius 온캔버스 핸들).

## 목표

flex/grid 프레임 선택 시 자식 사이에 드래그 핸들을 띄워 영역을 분배. 그리드는 행/열 리사이즈 + 셀 병합.

## 아키텍처 — 레이어 분리 (SOLID: SRP)

```
[순수 로직: 단위 테스트]            [캔버스 글루: 선례 패턴]            [커맨드: 위임]
layout-handle-geometry.ts   ──▶   LayoutEditHandles.tsx (view-model) ──▶ weave.frame.setLayout
  - 트랙/갭 선 위치(0..1)            - 포털 그립 렌더(corner-radius 동일)     weave.item.setLayoutChild
  - 포인터→비율 매핑                  - startHandleGesture(sink)            (read-modify-write,
layout-spec-edit.ts          ──▶   - DOM box geom(zoom 보정)               mergeKey=1 undo)
  - setGap / resizeTrack /            
    setSpan (비율 재분배·클램프)        
```

- **순수 모듈 2개**(React/DOM 비의존) → vitest로 전수 검증.
- **캔버스 컴포넌트**는 corner-radius-handle.tsx를 그대로 미러(geom 읽기, 포털 그립, gesture).
- **커맨드는 신규 없음**: 핸들 sink가 현재 layout을 읽어 순수 모듈로 새 spec 계산 → 기존
  `weave.frame.setLayout` / `weave.item.setLayoutChild`를 `mergeKey`로 호출(60Hz → 1 undo).

## 증분 1 — Flex gap/basis 드래그

- 기하: 컨테이너 DOM box + 자식 box들로 인접 자식 경계(주축) 선 위치 계산.
- 동작:
  - **gap 모드**(기본): 경계 드래그 → `spec.gap`(0..1, 부모 주축 비율) 조정. 전체 gap 일괄.
  - **basis 모드**(Alt? 또는 경계가 두 자식 사이일 때): 양옆 두 자식 `layoutChild.basis` 재분배(합 보존).
    → v1은 **gap만**, basis는 후속(스코프 단순화). DR-design-030 결정 참조.
- 커맨드: `weave.frame.setLayout`({...spec, gap}) mergeKey `layout-gap:<id>`.

## 증분 2 — Grid 트랙 리사이즈

- 기하: `resolveTrackSizes(tracks, gap, available)` + `trackOffset`로 각 열/행 경계선 0..1 위치 →
  화면 px(컨테이너 box 기준, zoom 보정).
- 동작: 경계선 i/i+1 드래그 → 두 트랙 크기 재분배(합 보존). `fr`/`auto` 트랙은 드래그 시 **ratio로
  고정 변환**(드래그=명시적 크기 의도), `minmax`는 v1 제외(경계 무핸들).
- 커맨드: `weave.frame.setLayout`({...spec, columns/rows: nextTracks}) mergeKey `layout-track:<id>:<axis>:<i>`.

## 증분 3 — Grid 셀 병합

- UI: 선택된 그리드 자식의 툴바에 "병합" 컨트롤(→/↓ 스팬 ±, 또는 셀 모서리 드래그 옵션).
- 순수: `setSpan(policy, colSpan, rowSpan)` — 1..(트랙수-시작+1) 클램프, 겹침 방지(점유 셀 검사는 v1
  단순: 클램프만, 충돌은 기존 dropGridCell/relayout이 처리).
- 커맨드: `weave.item.setLayoutChild`({...policy, columnSpan, rowSpan}).

## SOLID + GRASP 체크 (`.claude/skills/solid-grasp-review`)

- **SRP**: 기하(위치)·스펙편집(값)·렌더(그립)·커맨드(영속) 4책임 분리. ✅
- **OCP / Rule 6**: 핸들 종류는 `HANDLE_INTERACTIONS` 레지스트리 등록(switch 없음). 축(column/row),
  모드(gap/track/span)는 데이터로 분기 — 인라인 `switch (kind)` 금지. ✅
- **DIP**: 컴포넌트는 `editor.exec`(추상)에만 의존, 레이아웃 엔진 직접 호출 안 함. ✅
- **정보 전문가(GRASP)**: 트랙 위치 계산은 spec을 가진 기하 모듈이 소유. 비율 재분배는 spec-edit이 소유.
- **순수성/테스트성**: 순수 2모듈은 DOM/React 무의존 → 결정적 단위 테스트.
- **History 계약**: 모든 변경은 `editor.exec` 경유 + 드래그는 `mergeKey`로 1 undo, 종료 시 단일 커밋
  (CLAUDE.md 문서 변경 규칙 준수). e2e로 Cmd+Z 1스텝 복원 확인(실환경).

## Decommission

신규 기능이라 제거 대상 없음. WI-043/DR-design-019의 "드래그 보류" 서술은 본 WI로 해소되었음을 교차링크.

## 테스트 전략

- 단위: `layout-handle-geometry.test.ts`(선 위치/포인터→비율/zoom 보정 수학),
  `layout-spec-edit.test.ts`(gap 클램프, 트랙 재분배 합보존, span 클램프).
- 통합/회귀: `commands-layout-relayout` 기존 + setLayout/setLayoutChild 위임 케이스.
- e2e(실환경): 핸들 표시 → 드래그 → spec 변경 → Cmd+Z 1스텝.

## 리스크

- 줌≠100% 좌표(코너radius `screen/zoom` 재사용으로 완화).
- 핸들과 기존 선택 크롬/자식 드래그 컨트롤러 포인터 충돌 → view-model priority + `stopPropagation`.
- 트랙 재분배 시 fr↔ratio 혼합 → 드래그 트랙은 ratio 고정, 나머지 보존(결정 규칙 문서화).
- reduced-motion/접근성 → DR-design-030.
