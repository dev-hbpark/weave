# FR-022 — Aku roaming field-agent (편집 프레임 위치로 출동 + 애니메이션)

- **Date:** 2026-06-06 · **WI:** WI-106 · **Decision:** DR-073
- **Verdict:** **FEASIBLE**

## Question

에이전트 편집 중, 아쿠가 **편집이 일어나는 프레임의 화면 위치(랜덤)로 출동**해 이동→작업
애니메이션을 보여줄 수 있는가? (기존 엔진/스프라이트/락 재사용, producer 무수정.)

## Assessment — 필요 신호 2개 모두 존재

1. **무엇을 편집했는가**: `editor.changeStream.subscribe(cb, {origins:["user-command"]})` →
   `change.itemId`(item.attrs/children/units/unit.attrs에 존재). 에이전트 편집도 `editor.exec`
   → 같은 스트림으로 흐름. `AkuAssistant`는 이미 `editor`를 prop으로 보유 → 구독만 추가.
2. **그 프레임이 화면 어디인가**: 렌더된 프레임은 `data-frame-id={itemId}`(`NestedFrame.tsx`).
   `document.querySelector('[data-frame-id="…"]').getBoundingClientRect()` → 화면 좌표
   (카메라 줌/팬이 CSS에 반영돼 투영 수학 불요). 인터랙션 락이 스트리밍 중 스크롤/카메라를
   고정해 rect가 턴 동안 안정적(장점).

## Trade-offs (DR-073 수용)

1. 버스트 편집(weave.batch) → 디바운스 + 대상 변경 시에만 이동.
2. 화면 밖/미렌더 프레임 → 뷰포트 클램프 또는 그 편집은 스킵(직전 위치 유지).
3. reduced-motion → 로밍 비활성(런처 유지).
4. 경량 tier(canvas2d, 메인스레드) 사용 — 별도 worker 비용 회피(작고 일시적).

## Verdict rationale

last-edited itemId(changeStream)와 화면 rect(data-frame-id+getBoundingClientRect)가 모두
즉시 obtainable하고, 엔진/스프라이트(move-left/right=이동, editing=작업)/락이 이미 존재하므로
**FEASIBLE** — 순수 추가. → WI-106: `AkuFieldAgent` 오버레이.
