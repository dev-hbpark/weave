# RISK-009 — Rectangle corner radius

| Field | Value |
|---|---|
| ID | RISK-009 |
| Date | 2026-05-30 |
| Work item | [WI-055](../work-items/WI-055-shape-corner-radius.md) |
| Overall | **LOW** |

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `subAttrs` 부분 변경이 다른 subAttrs 필드를 누락시켜 attrs 전체 교체 reducer가 데이터를 날림 ([[feedback_weave_item_attrs_full_replace]]) | Med | High | 커맨드가 현재 `subAttrs`를 읽어 `cornerRadii`만 교체한 **완전한** subAttrs 객체를 빌드. rectangle 외 sub-kind는 fail. |
| R2 | rectangle이 아닌 도형에 커맨드 호출 시 잘못된 subAttrs 생성 | Med | Med | run()에서 `subAttrs.shape !== "rectangle"` 이면 명확한 에러 코드로 fail (`not-a-rectangle`). 툴바는 rectangle sub-kind일 때만 컨트롤 렌더. |
| R3 | 음수/NaN 반경 입력 | Low | Low | 커맨드에서 `Math.max(0, v)` + 유한성 검사. 렌더러가 상한 자동 캡. |
| R4 | 드래그 60Hz 편집이 undo 히스토리를 N개로 분할 | Low | Low | `item.attrs` 동일 target → 기존 `historyMergeWindowMs:500` mergeKey가 1 step으로 접음 (weave doc mutation rule 참조). |
| R5 | 멀티셀렉트에서 혼합값 표시 오류 | Low | Low | `sharedValue` + `MixedBadge` 기존 패턴 재사용. |

## Privacy / Security / Legal

해당 없음 — 순수 클라이언트 시각 속성, 개인정보·외부 전송 없음.
