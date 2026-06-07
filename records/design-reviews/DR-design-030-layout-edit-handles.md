# DR-design-030 — 레이아웃 편집 핸들 (gap/트랙 드래그 + 셀 병합)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-030 |
| Date | 2026-06-08 |
| Owner | hbpark |
| Component | app-local 온캔버스 핸들 `LayoutEditHandles`(포털 그립 + 트랙/갭 선); `@weave/design-system` 신규 primitive 없음(기존 토큰/색만 사용). 그리드 병합 UI는 기존 ContextualToolbar 컨트롤 재사용 |
| Work item | [WI-146](../work-items/WI-146-layout-edit-handles.md) |
| Triage Decision | **Step 1 — Reuse**(핸들 시각은 corner-radius 그립/선택 크롬 토큰 재사용; 병합 UI는 toolbar 재사용). 신규 디자인 primitive 없음 |

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | 그립 = corner-radius 핸들과 동일 스타일(`--accent` 테두리, `--surface-1` 배경, 12px 원). 트랙/갭 선 = 1~2px `--accent` 반투명 라인. 병합 ± 컨트롤 = 기존 toolbar Stepper/Select. **신규 primitive 불필요**. |
| 2. Extend | ✓ | corner-radius 그립에 "선(line) variant"가 없음 → 별도 라인 엘리먼트가 필요하나, 이는 app-local 캔버스 오버레이지 디자인시스템 컴포넌트가 아님(포털 div). |
| 3. Grow | ✗ | 새 토큰/테마/primitive 추가 안 함. |
| 4. Escape | ✅(부분) | 캔버스 위 드래그 핸들/선은 본질적으로 app-local 인터랙션 오버레이(디자인시스템 범주 밖, corner-radius-handle 선례와 동일) → app-local 구현. |

## Context

WI-043이 레이아웃 타입 피커 + 트랙 값 입력 폼까지 만들고, **드래그 핸들은 DR-design-019에서
명시적으로 보류**("v1.1 manual remove + re-add only")했다. WI-146이 그 후속으로, 캔버스에서 직접
아이템 사이를 드래그해 영역을 분배하는 인터랙션을 추가한다.

## 결정 (시각 + 인터랙션)

### 핸들 시각

- **갭/트랙 선**: 두 아이템(또는 트랙) 사이 경계에 **1~2px `--accent` 60% 라인**. hover/드래그 시
  불투명·굵기 ↑. 커서 = 축에 맞춰 `col-resize`(열/주축 row) / `row-resize`(행/주축 column).
- **그립(선택)**: 선 중앙에 작은 손잡이(corner-radius 그립 토큰 재사용, 12px). 선 전체가 히트영역.
- **셀 병합**: v1은 **선택된 그리드 자식 toolbar에 스팬 컨트롤**(→ +/- , ↓ +/-) — 무드래그, 저위험.
  (셀 모서리 드래그 병합은 후속 옵션.)
- 핸들은 **레이아웃 프레임이 선택됐을 때만** 표시(빈 캔버스 노이즈 방지). 자식 자체 선택/드래그
  (기존 layout-child-drag-controller)와 충돌하지 않도록 핸들은 경계선 좁은 영역에만, view-model
  priority 우선 + `stopPropagation`.

### 인터랙션 / 모션

- 드래그는 실시간(60Hz) 미리보기, `mergeKey`로 1 undo. ESC/포인터캔슬 = 취소(선례 dragGestureStates).
- **reduced-motion**: 핸들 자체는 모션 없음(즉시 추종). 트랜지션 애니메이션 없음 → 별도 처리 불필요.
- **접근성**: 그립 `aria-label`("열 너비 조절"/"행 높이 조절"/"간격 조절"), 병합은 toolbar 버튼이라
  키보드 접근 기본 확보. 캔버스 드래그는 본질적으로 포인터 기반 — 키보드 대안은 toolbar 입력 폼
  (WI-043 TrackSizeEditor)이 이미 제공(드래그는 보조 수단).

### 색/토큰

- `--accent`(선/그립 테두리), `--surface-1`(그립 배경), 기존 그림자 토큰. **신규 토큰 없음.**

## Out of scope (v1)

- 셀 모서리 **드래그** 병합(툴바 스텝퍼로 충분; 후속).
- flex **basis 재분배 드래그**(v1은 gap만; basis는 후속).
- `minmax` 트랙 경계 드래그(fr/ratio/auto만; minmax는 입력 폼 사용).
- 트랙 추가/삭제 드래그(기존 TrackSizeEditor 입력 폼 유지).

## 검증

- 핸들 시각/커서/aria는 실환경 스냅샷 확인 권장(샌드박스 캔버스 제약). 순수 기하/스펙 로직은 단위 테스트.
