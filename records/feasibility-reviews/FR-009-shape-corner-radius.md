# FR-009 — Rectangle corner radius

| Field | Value |
|---|---|
| ID | FR-009 |
| Date | 2026-05-30 |
| Work item | [WI-055](../work-items/WI-055-shape-corner-radius.md) |
| Verdict | **FEASIBLE** |

## Question

사각형 모서리 둥글기를 사용자 + 에이전트가 편집 가능하게 만들 수 있는가? 현재 기술
상태에서 빌드 가능한가, 내재적 한계는?

## Findings

| 영역 | 상태 |
|---|---|
| 데이터 모델 | **이미 존재** — `@agocraft/core` `ShapeSubAttrs` rectangle 변종에 `cornerRadii { tl, tr, br, bl }` (절대 px). |
| 렌더링 | **이미 존재** — `shapeToSvgGeometry`: 4코너 동일 시 `<rect rx ry>`, 비동일 시 `rectPathWithPerCornerRadii` path. 후자는 각 반경을 `[0, min(w,h)/2]`로 자동 클램프. SVG `<rect rx>` 도 스펙상 절반에서 자동 캡. → **오버플로 안전.** |
| 변경 파이프라인 | **이미 존재** — `weave.item.update`의 `item.attrs` Patch가 attrs 전체 교체. 신규 전용 커맨드도 동일 Patch 타입을 재사용. |
| UI primitive | **없음** — Figma식 링크/언링크 컨트롤은 design-system 신규 (DR-design-025, Grew × 1). NumberSlider + Switch + 4 입력 조합이므로 기존 토큰/패턴 내에서 합성 가능. |
| 에이전트 surface | **없음** — 전용 schema 필요(WI-055 핵심 산출물). |

## Trade-offs / 한계

- **단위 불일치(의도적):** rectangle은 절대 px, image/frame은 0..1 비율. 통일하지 않음 —
  코어 모델을 바꾸면 기존 직렬화 round-trip 깨짐. UI/스키마에서 px임을 명시.
- **per-corner 동일 시 element 전환:** 4코너 동일이면 `<rect>`, 비동일이면 `<path>`.
  렌더러 내부 동작이라 weave/에이전트에 영향 없음.
- 비-rectangle 도형 둥글기는 코어 모델 부재 → 범위 밖(별도 WI).

## Verdict

**FEASIBLE.** 데이터·렌더 레이어가 이미 완비되어 신규 위험이 낮다. 작업은 (1) 얇은
전용 커맨드, (2) 상세 schema, (3) UI primitive + 배선에 한정된다. agocraft 변경 0.
