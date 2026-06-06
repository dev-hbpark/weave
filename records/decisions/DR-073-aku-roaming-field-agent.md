# DR-073 — Aku roaming field-agent: changeStream-driven overlay over the edited frame

- **Date:** 2026-06-06 · **Status:** Superseded by **DR-074** (2026-06-06) · **WI:** WI-106 · **FR:** FR-022
- **Superseded:** the separate roaming `AkuFieldAgent` overlay (alongside the fixed
  launcher) showed "two Akus" when closed+working. DR-074 unifies into a single
  roaming launcher. The changeStream→edited-frame logic here was migrated into
  `useAkuRoam`.
- **Relates:** WI-104(엔진+스프라이트), WI-105/DR-072(인터랙션 락), DR-070 D2(시임),
  use-weave-editor `editor.changeStream`, `NestedFrame` `data-frame-id`.
- **Operator choices (2026-06-06):** ① **로밍**(별도 출동 마스코트, 런처는 홈 유지) ·
  ② **활발**(매 편집 진짜 랜덤 위치) · ③ **경량**(canvas2d tier).

## Decision

스트리밍 중 `AkuFieldAgent` 오버레이가 편집 프레임으로 출동한다:

### D1 — 별도 로밍 마스코트(런처 불변).
런처/패널은 그대로. 새 `AkuFieldAgent`(body portal, z-48, `pointer-events:none`, 장식)가
출동을 담당. 인터랙션 락 스크림 위에 보이며 포인터를 막지 않음.

### D2 — changeStream 구동 + DOM-rect 위치.
`editor.changeStream.subscribe(cb,{origins:["user-command"]})` → `change.itemId`.
`querySelector('[data-frame-id=id]').getBoundingClientRect()`로 화면 rect. 버스트는
**디바운스(~180ms)**, 대상이 바뀔 때만 이동. rect 없음(화면밖/미렌더) → 그 편집 스킵.

### D3 — 활발한 랜덤(매 편집).
대상 rect 안의 **랜덤 점**으로 매번(시드 고정 아님). 뷰포트로 클램프. 이전→현재 dx로
이동 방향 결정(move-left/right). 도착 후 작업 스프라이트(editing).

### D4 — 경량 canvas2d tier.
`createSpriteEngine(canvas,{tiers:["canvas2d"]})`(메인스레드, worker 없음). 일시적·소형
(96px)이라 GPU worker 불요. WASM 코어는 메인스레드에서 로드(캐시). contain-fit 재사용.

### D5 — reduced-motion 시 로밍 비활성.
이동 점프/연속 애니메이션이 전정 자극 → reduced-motion에선 `AkuFieldAgent` 미렌더(런처 유지).

### D6 — 순수 추가 / Triage = escape.
producer(에이전트·에디터) 무수정. feature-local(`features/aku/`). 위치 계산 순수함수
(`field-agent-target.ts`)로 분리해 단위검증.

## Consequences

- (+) "아쿠가 거기로 출동해 작업" 연출. 기존 엔진/스프라이트/락/시그널 재사용, producer 무수정.
- (+) 락이 카메라를 고정해 rect 안정 · canvas2d로 비용 최소.
- (−) 마스코트 2개(런처+로밍) — 산만 가능성(락 스크림이 시선을 로밍으로 모아 완화).
- (−) 화면 밖 편집은 출동 스킵(클램프로 가장자리 표시) · reduced-motion은 로밍 없음.
- 검증: 위치 순수함수 단위 + 강제-active 통합(편집→해당 프레임 rect로 이동) e2e;
  스트리밍 전체 turn은 서버 의존.
