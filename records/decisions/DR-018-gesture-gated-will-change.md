# Decision Record — DR-018

## Metadata

| Field | Value |
|---|---|
| ID | DR-018 |
| Title | Gesture-gated `will-change` on design plane (vs. permanent / vs. full two-phase reflow) |
| Decision Level | 1 Local |
| Owner | hbpark |
| Required approvers | hbpark (editor surface owner) |
| Consulted | — (rendering-performance-agent 미인보크; 변경 범위 1 prop, 표준 web hint) |
| Informed | LG-001 holder |
| Status | Accepted |
| Decided on | 2026-05-26 |
| Effective from | 2026-05-26 |
| Review-by | 2026-07-01 (Phase 2 필요성 재평가) |

## Context

`FrameStage.tsx:1716` design plane motion.div 에 `willChange: "transform"` 가 영구 부착. 사용자가 raster 이미지를 줌인할 때 GPU 텍스처 한계 초과로 타일 누락 발생. settle 후에도 layer 가 영구 promoted 상태라 브라우저가 더 높은 해상도로 re-rasterize 하지 않음.

LG-001 launch 2026-06-08, 13일 거리. Phase 3c e2e 12 fail 잔존 — risk window 가 평소보다 좁음.

## Options considered

| Option | Trade-off (gain / give up) | Risk class |
|---|---|---|
| A — 영구 will-change 유지 (현재) | gain: 단순 / give up: settle 후 타일 깨짐 영구 | 사용자 신뢰 손실 (관찰됨) |
| **B — 제스처 활성 윈도우 동안만 will-change 부착** | gain: settle 후 자동 re-rasterize, 1 파일 ~30 LOC / give up: gesture 첫 frame 의 layer promotion cost (~1-3ms 1회) | 매우 낮음 (CSS hint 토글) |
| C — Phase 2 까지 풀 two-phase reflow (settle 후 `pan.scale=1` reset + width/height 인플레이션) | gain: 가장 큰 줌에서도 완전 sharp / give up: 좌표 시스템 전반 수정, ~수백 LOC, e2e regression 가능 | 중간 (launch 직전 부적절) |
| Do nothing | gain: 0 / give up: 알려진 visual bug 로 launch | 낮음-중간 (data 안전, 인식 손실) |

## Decision

**Option B — gesture-gated `will-change`.** 활성 gesture 신호 = `panDragging` OR `(now - lastWheel) < 200ms` OR `baseScale` 변동 중. 신호 동안 `willChange: "transform"`, 그 외 `undefined`.

## Why this option

- **근본 원인 해소**: 영구 will-change 가 브라우저의 자동 layer 관리(promote/demote → re-raster at correct resolution)를 차단. gating 으로 정상 흐름 복원.
- **공급망 안정**: 코드 변경이 CSS prop 1 개의 conditional 만 사용. e2e regression 표면적 거의 0. declarativecheck / puritycheck 영향 없음.
- **gesture 중 성능 무변동**: 활성 윈도우 동안 will-change 가 켜져 있으므로 GPU 합성 경로가 현재와 동일. 60fps 보장.
- **Phase 2 의 prerequisite**: Phase 2 (settle reflow) 를 추후 할 경우 어차피 Phase 1 이 먼저 필요. 지금 박제해도 sunk cost 없음.
- **Launch window 호환**: 13일 전, e2e 12 fail 잔존하는 시점에 design-plane 좌표계 전체 수정은 risk profile 위반. Phase 1 만 launch 전 머지, Phase 2 는 telemetry 보고 판단.

specialist 인보크 생략 사유:
- `rendering-performance-architecture-agent`: standard browser rendering hint, no novel pattern; agent 의 기존 web-baseline review 가 cover.
- `frontend-performance-agent`: 변경 범위가 will-change 단일 prop 로 INP / LCP / CLS 영향 없음.

## Consequences

- **Code / architecture**: `FrameStage.tsx` 에 `gestureActive` derived state 추가 (`panDragging || recentWheel`). wheel handler 에 `bumpWheel()` 1 호출 추가. motion.div 의 `willChange` style 을 `gestureActive ? "transform" : undefined` 로 변경.
- **Process / workflow**: 없음.
- **Cost / ops**: 없음. (browser 의 layer promotion/demotion 은 무료 — 영구 promote 이 오히려 GPU 메모리 더 사용)
- **User experience**: 줌인 후 1-2초 안에 타일 깨짐이 사라지고 정확한 해상도로 다시 그려짐. gesture 중 perf 무변동.
- **Risk posture (accepted residual risk)**:
  1. *제스처 전환 시 layer flicker* — Chromium / Safari / Firefox 모두 layer promote/demote 자체가 새로운 paint pass 를 일으킬 수 있음. 200ms debounce 가 gesture 의 자연스러운 휴지(wheel 사이 brief pause)에 걸려 자주 토글되면 paint 비용 누적 가능. 완화: window 를 200ms 로 잡아 일반 wheel 연속에서는 한 번도 떨어지지 않도록.
  2. *Phase 2 가 결국 필요한 경우* — extreme 줌 (>5x) 의 super-large 이미지에서 Phase 1 만으로 부족할 수 있음. 사용자 telemetry 또는 본인 재현 보고로 판단 후 WI-038 으로 처리.

## Conditions / follow-ups

- [ ] launch 후 1주: 사용자 보고 + browser perf trace 로 Phase 1 충분성 평가.
- [ ] 불충분하면 → WI-038 (Phase 2 reflow) 발행.
- [x] 2026-05-26 follow-up — wheel zoom 의 anchor 를 pointer 로 변경 (사용자 요청). 순수 `nextPanForZoom(prev, factor, anchor)` 헬퍼로 추출하여 미래 hotkey/줌 버튼 path 는 `anchor = { x: outerW/2, y: outerH/2 }` 만 전달하면 viewport-center anchor 동작. 본 DR 범위 안 (will-change 게이팅과 같은 wheel handler 위, 같은 PR 머지 대상).

## Dissent (if any)

없음. solo decision.

## Links

- Triggering Work Item: WI-037
- Originating Handoff (intra or cross-project): 없음
- Related Risk reviews: 없음
- Superseded DRs: 없음
