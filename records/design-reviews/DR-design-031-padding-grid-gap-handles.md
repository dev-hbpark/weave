# DR-design-031 — 패딩 + 그리드 gap authoring 핸들

> **Refined by DR-design-033** (2026-06-14): "그립이 flat/미완성" 인정분을 마감.
> GapGrip에 elevation shadow(`0 1px 4px rgba(0,0,0,0.22)`, resize 핸들과 parity)
> + `borderRadius: 2` 추가, gap/track 라인 opacity 0.55→0.42, padding dash
> 0.7→0.6 — 그립=primary 타깃 / 라인=secondary guide 위계 확립. 색/토큰/기하 무변경.

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-031 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Component | app-local 온캔버스 핸들 `LayoutEditHandles`(포털 라인/그립). `@weave/design-system` 신규 primitive 없음 — DR-design-030 선례 그대로 |
| Work item | [WI-219](../work-items/WI-219-padding-grid-gap-authoring-handles.md) |
| Triage Decision | **Step 1 — Reuse**(DR-design-030이 정의한 온캔버스 핸들 패턴/토큰 그대로 확장). 신규 디자인 primitive 없음 |

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | 패딩 엣지/갭 그립 = 기존 gap/트랙 라인과 동일 클래스(포털 div, `--accent`, z40). corner-radius 그립 토큰 재사용. **신규 primitive 불필요.** |
| 2. Extend | ✓ | 패딩 라인은 트랙/갭 라인과 **구분**돼야 함(같은 `--accent` 실선이면 혼동) → 패딩은 **dashed**, gap 그립은 **작은 다이아몬드**로 시각 분화. 디자인시스템 컴포넌트가 아닌 app-local 캔버스 스타일 분화. |
| 3. Grow | ✗ | 새 토큰/테마/primitive 없음. 기존 `--accent`/`--surface-1`만. |
| 4. Escape | ✅ | 캔버스 드래그 오버레이는 본질적으로 app-local(디자인시스템 범주 밖) — DR-design-030·corner-radius 선례 동일. |

## Context

DR-design-030(WI-146)은 **gap(flex)/트랙(grid) 드래그**만 다뤘고 padding 드래그는 범위 밖이었다.
WI-043이 gap/padding을 **고정-px**로 만들 수 있게 한 뒤, 정작 padding을 캔버스에서 *작성*할 수단이
없다는 빈틈이 남았다. 본 리뷰는 그 후속(WI-219)의 시각/인터랙션을 정한다.

## 결정 (시각 + 인터랙션)

### 패딩 엣지 (flex + grid)

- 프레임 안쪽, 현재 패딩만큼 들여쓴 위치에 **4면 dashed `--accent` 라인**(트랙/갭 실선과 구분).
- 좌/우 엣지 = 세로선 `col-resize`, 상/하 엣지 = 가로선 `row-resize`. 안쪽으로 끌면 그 면 패딩 ↑.
- 코너 리사이즈 그립과 충돌 회피: 패딩 라인은 **엣지(변)** 위에만 그리고 코너 영역은 비움.
- 작성 단위 = `paddingPx`(per side) + ratio 미러(즉시 reflow 정확, 이후 리사이즈 시 px 고정).

### 그리드 gap 그립 (grid only) — 사용자 선택안 "전용 gap 그립"

- 트랙 사이 gap 밴드 **중앙**에 작은 **다이아몬드 그립**(트랙 경계 실선과 시각·히트 분리).
- 열 그립 = 좌우 드래그 → 균일 `columnGapPx`; 행 그립 = 상하 드래그 → 균일 `rowGapPx`.
- 트랙 경계 실선의 **플레인 드래그 = 트랙 리사이즈**(기존 유지). 그립이 라인 위 작은 점이라 렌더 순서상
  그립이 그 지점 포인터를 가져가고, 나머지 선 영역은 트랙 리사이즈로 남음.
- factor = `boundaryIndex + 0.5`(flex gap과 동일) — 그립이 커서를 1:1로 추종.

### 색/토큰

- `--accent`(라인/그립), `--surface-1`(그립 배경). **신규 토큰 없음.**

## 접근성 / 한계

- 캔버스 드래그는 포인터 기반. 본 컨트롤은 키보드 대안(toolbar 숫자 입력)이 **아직 없음** → 후속 WI에서
  toolbar gap/padding 숫자 입력 추가(WI-219 Out of scope). aria-label은 부여("왼쪽 패딩 조절" 등).
- reduced-motion: 핸들은 즉시 추종, 트랜지션 없음 → 별도 처리 불필요.

## 검증

- 순수 기하/스펙 로직 = 단위 테스트(`layout-spec-edit.test.ts`). 시각/커서 = 라이브 e2e + 스냅샷 권장.
