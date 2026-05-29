# FR-010 — Shape gradient fill

| Field | Value |
|---|---|
| ID | FR-010 |
| Date | 2026-05-30 |
| Work item | [WI-056](../work-items/WI-056-shape-gradient-fill.md) |
| Verdict | **FEASIBLE** |

## Question

도형 그라데이션 채우기를 사용자 + 에이전트가 안정적으로 설정 가능하게 만들 수 있는가?

## Findings

| 영역 | 상태 |
|---|---|
| PaintSpec 모델 | **존재** — `@agocraft/core` `PaintSpec` = none/solid/linear-gradient/radial-gradient/image/video, `GradientStop{offset,color}`. |
| spec→CSS/SVG | **존재** — `paintToCss`, `paintToSvgFill` (둘 다 vendored core export). |
| 렌더 | **존재** — `ShapeBlock.tsx` 가 linear/radial defs 를 SVG 로 정확히 렌더. |
| picker | **존재** — `ColorPicker` 단색/그라데이션 2 탭, 정규 문자열 emit/parse. |
| 결손 | (a) `shape-section` 커밋이 그라데이션을 solid 로 덮어쓰는 **버그**, (b) string→spec 역파서, (c) 에이전트 전용 스키마. 셋 다 weave 측 소규모. |

## Trade-offs / 한계

- **radial UI 부재:** ColorPicker 가 linear 만 편집 → radial 은 에이전트/프로그램 경로
  전용. 향후 ColorPicker radial 탭으로 해소 가능(범위 밖).
- **단위:** 그라데이션 stop color 는 절대 hex(테마 토큰 아님). 단색만 StyleRef(`var(--token)`)
  보존. picker 가 그라데이션 stop 을 hex 로만 emit 하므로 일관.

## Verdict

**FEASIBLE.** 모델·렌더·picker 가 완비 → 위험 낮음. 작업은 배선 버그 수정 + 얇은
파서 + 전용 커맨드/스키마. agocraft 변경 0.
