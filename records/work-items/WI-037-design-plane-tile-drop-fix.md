# Work Item — WI-037

## Metadata

| Field | Value |
|---|---|
| ID | WI-037 |
| Title | Design plane tile-drop fix + pointer-anchored wheel zoom |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 (visible artifact in editor at common zoom levels; not a data-loss bug) |
| Created | 2026-05-26 |
| Target date | 2026-05-27 |
| Closed | — |

## Summary

작업 중 디자인 페이지를 줌인하거나 특정 프레임으로 슬라이드한 직후 정지 상태에서, 이미지가 부분적으로 비어 보이거나(타일 누락) 격자무늬로 깨져 보이는 현상. 사용자가 큰 raster 자산을 다루며 `Cmd+Wheel` 로 줌을 ~3x 이상 적용할 때 재현. 결과 디자인은 멀쩡하나 편집 중 시각 신뢰가 무너짐.

## Scope

**In scope (Phase 1)**:
- `apps/web/src/pages/FrameStage.tsx` 의 design plane motion.div 에 영구로 박힌 `willChange: "transform"` 을 *제스처 활성 윈도우 동안만* 부착하도록 게이팅.
- gesture 활성 신호 = (a) PanBinding 의 `panDragging` 상태 OR (b) 마지막 wheel 이벤트로부터 200ms 이내.
- PresentPage 는 변경 없음 (영구 will-change anti-pattern 없음 — `grep` 확인).

**In scope (Phase 1 follow-up — 사용자 요청 2026-05-26)**:
- 휠/핀치 줌의 anchor 를 viewport 중앙 → 포인터 위치로 변경. 커서 아래 디자인-픽셀이 줌 전/후 동일 viewport 위치 유지.
- 순수 헬퍼 `nextPanForZoom(prev, factor, anchor)` 로 추출 — 향후 hotkey/줌 버튼 caller 는 `anchor = { x: outerW/2, y: outerH/2 }` 만 전달.
- `[0.1, 8]` clamp 보존 + clamp 도달 시 effective factor 재계산으로 drift 방지.

**Out of scope (deferred, see DR-018 §Consequences)**:
- Phase 2 (settle-시점 `pan.scale` reset + 논리적 width/height inflation 으로의 reflow) — Phase 1 효과 측정 후 launch 후속 WI 로 평가.
- 이미지 leaf 별 decode resolution 동적 swap — Phase 1 으로 부족할 때만.
- `infiniteCanvas=false` flavor — `pan.scale` 자체가 1 고정이라 영향 없음.
- 실제 hotkey/줌 버튼 UI — 헬퍼 계약만 준비, 도입은 별도 WI.

## Acceptance criteria

- [ ] `pnpm verify` PASS (lint / tokencheck / declarativecheck / puritycheck / typecheck / unit / build).
- [ ] `pnpm e2e` PASS — 베이스라인 대비 fail 수 동일 (Phase 3c 의 12 fail 잔존이 baseline; 신규 fail 없음 = pass).
- [ ] 수동 재현: 1920×1080 design 에 800×600 이상 raster 이미지 3-4 개 배치 → `Cmd+Wheel` 로 3-5x 줌인 → 정지 후 1-2 초 안에 타일 누락이 사라지고 또렷한 raster 가 표시.
- [ ] 제스처 *중* 60fps 유지 (Cmd+Wheel 연속, PanBinding 드래그) — Chrome DevTools Performance trace 로 확인.
- [ ] `data-testid="frame-stage"` 의 design-plane motion.div 에서 `getComputedStyle().willChange === "transform"` 가 gesture 중에만 true, 정지 200ms 후 false.

## Context

사용자가 직접 보고 (2026-05-26 세션): 큰 이미지를 줌아웃 또는 줌인 후 작업 시 raster 의 "타일이 빠지는 것처럼 깨지는 현상". 진단 = Chromium 의 GPU 텍스처 한계 (4096–8192px) 를 합성 layer 가 초과. 영구 `will-change: transform` 이 settle 후 re-rasterize 를 막아 정지 상태에서도 깨짐이 유지됨.

LG-001 (text-item v1) launch 2026-06-08 13일 전. v1 launch 전 closing 가능한 P1 visual bug.

## Escalation triggers (check before starting)

- [x] UI / UX change → 단, design-system 컴포넌트 추가/수정 없음 (CSS prop 1 개 토글). Triage Step 1 (Reuse, no new primitive). Design Review 불필요.
- [ ] User data — N/A
- [ ] Payment — N/A
- [ ] AI feature — N/A
- [ ] Public page — N/A (editor 내부)
- [ ] Library / dependency — N/A (코드 변경만)
- [x] Release → LG-001 conditional 항목에 close-out 으로 등록.

## Technical Feasibility verdict

- FR record: 생략 (boundary-pushing 아님, 표준 브라우저 rendering hint 사용)
- Verdict: FEASIBLE
- Accepted trade-offs: gesture 종료 ~200ms 사이 settle 동안 잠깐의 추가 layer composition pass 발생 가능. 사용자 인지 한계 미만.

## Links

- Related Decision Records (DR-*): DR-018
- Related Risk reviews (RISK-*): 없음 (no data risk; visual-only fix)
- Related Feasibility Reviews (FR-*): 없음
- Related Handoffs (HANDOFF-*): 없음
- Related Incidents (INC-*): 없음
- Related Engineering Plan: 본 WI 내 §Scope 가 plan 을 대체 (1 파일 ~30 LOC scope)
- Related Launch Gate (LG-*): LG-001 (close-out 항목)

## Status updates

- 2026-05-26: WI 생성. Phase 1 (will-change gating) 구현 시작.
- 2026-05-26: Phase 1 구현 머지 대기. `FrameStage.tsx` +~40L (recentWheel state + bumpWheel + cleanup effect + gestureActive 도출 + wheel handler 의 bumpWheel 호출 + design-plane motion.div willChange 게이팅). Gates: typecheck ✓, declarativecheck ✓, puritycheck ✓, unit 105/105 ✓, build ✓ (280.37 KB gz, +0L 의미있는 변동 없음), e2e 127 passed / 17 failed (retries 포함) / 29 skipped — failures 모두 Phase 3c 알려진 baseline cluster (ai-tooltip / text-item / tooltip-editor / multi-marquee-flow), 신규 regression 0. 수동 재현 / Chrome DevTools Performance trace 는 launch 전 본인 환경에서 수행 필요 (acceptance criteria 의 3/4/5).
- 2026-05-26: 미해결 acceptance criteria 잔여 = (3) raster 3-4 개 배치 후 3-5x 줌인 → 1-2초 안에 깨짐 해소 수동 확인, (4) gesture 중 60fps Performance trace, (5) `getComputedStyle().willChange` 토글 확인. 모두 production 머지 전 본인 환경에서 수행 권장.
- 2026-05-26: 사용자 요청 follow-up 머지 대기 — 휠/핀치 줌 pointer 앵커. `FrameStage.tsx` 에 순수 `nextPanForZoom(prev, factor, anchor)` 헬퍼 (~25L) 추가, 휠 handler 가 호출. 향후 hotkey/버튼은 `anchor = { x: outerW/2, y: outerH/2 }`. Gates: typecheck ✓, declarativecheck ✓, unit 105/105 ✓, space-pan e2e ✓ (pan path regression 없음). 사용자 수동 확인 acceptance: ① Cmd+Wheel 로 줌인 시 커서 아래 점이 정지 유지, ② 줌아웃도 동일, ③ scale clamp (0.1 / 8) 도달 시 drift 없음.
