# RISK-010 — Shape gradient fill

| Field | Value |
|---|---|
| ID | RISK-010 |
| Date | 2026-05-30 |
| Work item | [WI-056](../work-items/WI-056-shape-gradient-fill.md) |
| Overall | **LOW** |

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | string↔spec 파서가 ColorPicker emit 과 어긋나 round-trip 손실 | Med | Med | `parseLinearGradientPaint` 가 ColorPicker `parseLinearGradient` 와 **동일 grammar**(hex stop만). `fill-paint.test.ts` 가 `paintToCss` 와의 round-trip 단언. |
| R2 | 그라데이션 fill 이 `item.attrs` 전체 교체 reducer 와 충돌해 다른 attrs 손실 ([[feedback_weave_item_attrs_full_replace]]) | Low | High | 커밋/커맨드 모두 `{ ...prev.attrs, fill }` 로 **나머지 attrs 보존**. |
| R3 | 에이전트가 malformed fill(빈 stops, 미지 type) 전송 | Med | Low | 커맨드가 type enum + 그라데이션 ≥2 stops 검증, `invalid-input`/`not-a-shape` 으로 거부. e2e 로 확인. |
| R4 | radial 을 picker 로 편집 시도 → 표시만 되고 편집 불가 혼란 | Low | Low | 한계로 문서화(FR-010/WI-056). UI 는 linear+solid, radial 은 에이전트 경로. |
| R5 | solid 의 `var(--token)` StyleRef 가 그라데이션 분기에서 깨짐 | Low | Med | solid 분기만 `pickerValueToStored` 통과; 그라데이션은 hex stop 이라 StyleRef 무관. |

## Privacy / Security / Legal

해당 없음 — 클라이언트 시각 속성.
