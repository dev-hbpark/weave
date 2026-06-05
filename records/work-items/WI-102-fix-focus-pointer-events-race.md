# WI-102 — fix: 포커스(눈) dim/isolate의 "다른 프레임 편집 제외"가 동작 안 함

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-06) |
| Owner | hbpark |
| Relates | WI-039(2단계 포커스), WI-100/DR-069(그룹 눈 버튼), bf9c328(use-frame-focus 추출) |

## Problem (operator, 2026-06-06)

눈(포커스) 아이콘을 눌러도 **해당 프레임 외 요소들의 편집 인터랙션 제외(dim/isolate)가
동작 안 함**. 포커스 상태(stage 표시)는 바뀌지만 다른 프레임이 여전히 클릭/편집 가능.

## 점검 결과

체인을 전 구간 추적: `useFrameFocus`(dim="above"/isolate="outside" 세트 계산) → DesignPage →
FrameStage → NestedFrame(자식까지 재귀 전달) → opacity(style) + pointer-events(`applyHitGate`).
세트 계산·전달·opacity는 모두 정상. **단일 결함 지점**: pointer-events 차단이 `applyHitGate`의
**명령형 `el.style.pointerEvents='none'`에만** 의존(원본 주석도 "single authority ... React/imperative
가 안 싸우게"로 이 취약성을 인지). 래퍼가 `motion.div`라, motion이 자기 style 객체를 (재)적용하는
타이밍이 `applyHitGate`(useLayoutEffect) 이후에 끼면 명령형 `none`이 유실 → 게이트된 프레임이
다시 클릭 가능해짐(보고된 증상).

## Fix

포커스 pointer-events 차단을 **React/motion style에도 선언**:
게이트(dim/isolate) 프레임이면 `style.pointerEvents:'none'`. 결정적(deterministic) 케이스라
motion이 직접 none을 적용 → 어떤 재적용/타이밍에도 유실 불가. SIZE 게이트(footprint 기반 auto/none)
는 비-게이트 프레임에서만 `applyHitGate`가 명령형으로 계속 담당(이 키는 비-게이트 프레임에선
style에서 생략 → 둘이 같은 프레임을 두고 충돌하지 않음). 자식까지 세트가 전달되므로 서브트리 전체
차단 유지. 모델/명령 변경 없음.

## Acceptance

- 포커스(stage 1 dim) 시 z-order 위 형제 프레임 캔버스가 pointer-events:none. ✔
- 포커스된 프레임 자신은 interactive 유지. ✔

## Verification (2026-06-06, SVL gate)

- Typecheck clean; biome clean(NestedFrame.tsx, spec).
- 신규 e2e(`thumbnail-panel.spec.ts`): 2 슬라이드 → 첫 프레임 포커스(stage1) → 둘째 프레임
  캔버스 래퍼 getComputedStyle.pointerEvents==='none', 포커스 프레임은 ≠ none. (브라우저 없는
  로컬 미실행, CI 수행.)
