# WI-097 — 에이전트 레이아웃 규칙: 한 셀/슬롯에 아이템 하나, 여러 개는 중첩 프레임

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-05) |
| Owner | hbpark |
| Decision | DR-066 |
| Relates | WI-020/043(레이아웃), WI-095(에이전트 표면) |

## Problem (operator, 2026-06-05)

그리드/플렉스 레이아웃에서 **하나의 셀(슬롯)에는 아이템이 하나만** 들어가고, 한 셀에 여러 개를
넣으려면 **그 셀의 단일 child로 중첩 프레임**을 두고 그 안에 넣어야 한다는 규칙을 에이전트가 알고
작업해야 한다. 기존 가이드는 트랙/스팬/자식정책은 설명했지만 이 제약은 명시하지 않았음 →
에이전트가 카드(제목+본문+버튼)를 한 셀에 넣으려고 셋을 그리드에 직접 넣으면 셋이 각각 다른
셀로 흩어짐.

## Verification (엔진 동작 확인)

@agocraft/layout 엔진은 child 합류 시 **다음 빈 셀**(row-major, span 고려)을 차지(engine.ts
occupied-cell 스캔). 두 child가 한 셀 공유 불가, columnSpan/rowSpan은 단일 child의 셀 병합만.
→ 규칙 정확.

## Change

세 지점에 명시(api·byo-ssh 공통):
1. `WEAVE_CAPABILITIES.layoutKinds` auto-grid/auto-flex description+childConstraints.
2. `WEAVE_DOMAIN_KNOWLEDGE` 규칙0에 "ONE ITEM PER CELL / SLOT" 단락(카드/스탯/아이콘+라벨 예시).
3. `WEAVE_TASK_PRIMER` 한 줄 리마인더.

해결책: 한 셀/슬롯에 여러 아이템 → 그 셀의 단일 child로 중첩 프레임(presentable:false, 자체
auto-layout) 두고 안에 배치. (small-think 하네스에도 호스트 무관 일반 규칙 보강 — WI-026.)

## Acceptance

- 규칙 + 해결책(중첩 프레임)이 capabilities·도메인지식·primer에 명시. ✔
- 코드/동작 변경 없음(엔진은 이미 그렇게 동작) — 가이드 갭만 메움. ✔

## Verification (2026-06-05, SVL gate)

- Typecheck clean; aku-agent 스위트 통과; biome clean(변경 파일).

See DR-066.
