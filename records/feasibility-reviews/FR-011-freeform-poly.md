# FR-011 — Freeform polygon (`poly`)

| Field | Value |
|---|---|
| ID | FR-011 |
| Date | 2026-05-30 |
| Work item | [WI-057](../work-items/WI-057-freeform-poly-shape.md) |
| Verdict | **FEASIBLE** |

## Question

SVG-geometry 방식의 자유 정점 폴리곤을, 변형은 커맨드 경유로, 모델·렌더는 agocraft에
두고 추가할 수 있는가?

## Findings

| 영역 | 상태 |
|---|---|
| 모델 | agocraft `ShapeSubAttrs` 판별 유니온에 `poly` 변종 additive 추가 가능 — 기존 polygon/path와 공존. |
| 좌표 단위 | 0..1 bbox 비율 → 리사이즈/회전/reparent 자동(프레임 패러다임). regularPolygon과 동일 렌더 수학. |
| 렌더 | `SvgGeometry.element`에 `polygon`/`polyline` 이미 선언(polyline 미사용이었음). ShapeBlock은 element-제네릭 → 변경 0. |
| 커맨드 | agocraft `createSetDecorationCommand` 선례와 동형의 팩토리 → item.attrs 패치. host는 이름만 주입. |
| Unit(agocraft) | 정점은 attrs.subAttrs에(path.d 선례). 별도 Unit 불필요. fill/stroke/shadow 데코 Unit은 그대로 적용. |
| UX(생성) | shape-section sub-kind picker + 아이콘으로 즉시 추가 가능. |
| UX(정점 드래그) | 신규 InteractionMode + selection-chrome 핸들 + gesture binding 필요 — 규모 큼(Phase 2 분리). |

## Trade-offs / 한계

- **정점 라운딩 없음** — 임의 정점 모서리 둥글기는 각 정점 arc 삽입 필요(복잡), v1 직선
  세그먼트. 향후 path 승격.
- **정점 드래그 UX는 별도 Phase** — 데이터/렌더/커맨드/생성은 완비, 직접 조작은 후속.
- 대규모(수백 정점)/협업 정점 편집 시 Y.Array Unit 승격 여지(텍스트 XmlText 선례).

## Verdict

**FEASIBLE.** 모델·렌더·커맨드는 기존 패턴에 정확히 들어맞아 낮은 위험으로 landing.
직접조작 정점 편집만 규모가 커 Phase 2로 분리.
