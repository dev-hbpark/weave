# Decision Record — DR-024 poly 프레임은 정점을 따라간다 + 끝점 = 균등 similarity 스케일

## Metadata

| Field | Value |
|---|---|
| ID | DR-024 |
| Title | freeform `poly`(자유선/곡선/자유곡선/직선/자유다각형)의 vertex 핸들 드래그는 프레임(러버밴드)을 정점들에 맞게 refit 한다. 열린 poly 의 양끝점은 **추가로** 반대쪽 끝점 기준 균등 similarity(스케일+회전) 로 선 전체를 변형한다. 직선도 2-point 열린 poly 로 통일. |
| Decision Level | **1 Local** — weave 내부 selection-chrome / 도형 편집 UX. agocraft `poly` 스키마 불변(points/closed/smooth 그대로). |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-05-31): "모든 poly 핸들은 프레임 크기에 영향" + "양끝점은 추가로 모든 꼭지점 거리를 균등 조절" → AskUserQuestion 으로 **전체 균등 스케일(비율 유지)** 확정 |
| Status | **Accepted** |
| Decided on | 2026-05-31 |
| Pairs with | DR-023 (kind-owned selection chrome — poly-vertex VM 가 그 registry 위에 동작), WI-057 (poly 도입), WI-060 |
| Triggering Work Item | WI-061 |

## Context

기존 모델: `poly` 의 `points` 는 frame bbox 의 0..1 비율, frame 이 authoritative, `weave.shape.setVertices` 는 **bbox 고정** 채 points 만 갱신(정점은 박스 안에서만 이동, clamp01). `line` 은 별도 sub-kind 로 박스의 수평 midline(끝점 편집 불가).

사용자 요구:
1. **모든 poly vertex 드래그가 프레임(러버밴드)의 크기·위치를 정점에 맞게 바꿔야** 한다 — 박스가 정점을 따라가는 모델(현재의 역방향).
2. **양끝점 2개는 추가로** 선의 모든 꼭지점 거리를 **균등하게(비율 유지 similarity)** 조절 — 끝점이 전체 선의 스케일 핸들.

## Decision

1. **프레임 follows 정점 (refit)**: vertex 드래그 시 base(점/frame/geom)+커서로 새 local 점을 구하고, 프레임을 점들의 AABB 로 refit + 점들을 새 프레임 기준 [0,1] 로 재정규화. frame+points 를 **단일 `weave.item.update` 패치**로 dispatch(60Hz → 1 undo). 모든 poly(열림/닫힘) 공통.
2. **끝점 = 균등 similarity**: 열린 poly 의 첫/끝 정점 드래그는 반대쪽 끝점을 anchor 로 **화면 공간(등방)** 복소수 similarity(스케일·회전)를 전 점에 적용 → 모양 비율 보존한 채 전체 확대/축소. 내부 정점은 자유 이동. (2-point 직선은 양끝이 모두 끝점 → 자유 이동으로 자연 degenerate.)
3. **직선 통일**: 추가 메뉴의 "직선" 은 `line` sub-kind 대신 **2-point 열린 poly** 로 생성 → 끝점 핸들·refit 동일 적용. (`line` sub-kind 는 스키마/타입변경 드롭다운에 잔존.)
4. **좌표/회전 범위**: refit 은 axis-aligned(θ≈0) 에서 old-frame-relative 순수 연산(부모/화면 치수 불필요). 회전된 프레임(θ≠0)은 axis-aligned refit 불가 → legacy clamp-in-place 로 graceful fallback. 끝점 similarity 는 화면 px(등방)에서 계산해 비율 보존.
5. **퇴화 처리**: 한 축이 collapse(수평/수직 직선)하면 그 축 점을 0.5 로, 프레임 치수를 hairline 로 유지 — 러버밴드가 선에 밀착(Figma 라인 셀렉션과 동형).

구현: `selection-chrome/poly-vertex-handle.tsx` (`refitFrameToPoints` + endpoint similarity in `beginVertexDrag`), `getPoly` 가 frame 도 반환(DesignPage), 직선 seed = `STRAIGHT_LINE_SUBATTRS`(2-point open).

## Why this option

- 사용자 명시 확정(전체 균등 스케일, 비율 유지).
- old-frame-relative refit 은 부모/카메라 좌표 변환 없이 정확(θ=0 다수 케이스) → 단순·견고.
- 화면-공간 similarity 는 비율(등방) 보존을 정확히 보장.
- 직선=2-point poly 통일로 "선" 4종이 단일 편집 모델 공유(끝점 핸들 일관).

## Consequences

- vertex 드래그 dispatch 가 `weave.shape.setVertices`(points-only) → `weave.item.update`(frame+points) 로 변경. 삽입/삭제(midpoint/double-click)는 setVertices 유지(박스 내 작업).
- 직선이 `poly`(2pt) 로 바뀜 → add-menu 테스트 갱신. 타입변경 드롭다운의 "선"(line) 과 약한 불일치(수용; line 은 고급/legacy 변형).
- 수평/수직 직선의 러버밴드가 hairline(0-height) → e2e 는 가시성 대신 존재(count)로 단언.
- θ≠0 poly 의 vertex 드래그는 프레임 refit 대신 clamp fallback(기존 동작) — known limitation, 후속.

## Verification

- `tsc` green. 신규 `line-endpoint-drag.spec.ts`(끝점 드래그→frame follow + 점 정규화) pass. add-menu / line-selection-handles / shape-poly / shape-smooth-toggle 13 pass. 스크린샷: 러버밴드가 정점을 tight 하게 추종, 끝점 similarity 로 지그재그 비율 보존.

## Dissent

없음. 사용자 명시 confirm.

## Links

- Triggering Work Item: WI-061
- Pairs: DR-023 (kind-owned chrome), WI-057 (poly)
- Code: `apps/web/src/document/selection-chrome/poly-vertex-handle.tsx`, `apps/web/src/pages/DesignPage.tsx` (`getPoly`, `STRAIGHT_LINE_SUBATTRS`)
- Test: `apps/web/e2e/line-endpoint-drag.spec.ts`
