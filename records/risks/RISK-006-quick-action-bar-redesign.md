# RISK-006 — QuickActionBar UX 재설계 risk (GO WITH CONDITIONS)

## Metadata

| Field | Value |
|---|---|
| ID | RISK-006 |
| WI | WI-036 |
| Date | 2026-05-26 |
| Owner | hbpark |
| Verdict | **GO WITH CONDITIONS** |

## Risk inventory

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | bar 의 transform scale 따라가서 size 가 변함 | High | Medium | counter-scale wrap — bar wrap div 의 `transform: scale(1/scale)` 또는 outside-transform absolute container 에 mount. |
| 2 | hovered frame 변경 시 grace timer 의 stale bar 가 잠시 표시 | Medium | Low | enter 시 cancel — 다음 hover 가 들어오면 timer cancel 후 EMPTY → 새 hover. |
| 3 | nested frame 의 bar 가 outer frame 의 bar 와 동시 표시 | Medium | Medium | useHoverContext 의 hovered id 가 deepest. 의 bar 는 deepest 만 visible (single source). |
| 4 | bar 의 click 이 frame 의 click handler 와 충돌 | Low | Medium | bar 의 `event.stopPropagation` — frame 선택 안 함. |
| 5 | grace period 가 e2e timing 의 race | Medium | Low | e2e 의 `expect.poll` 가 grace 만료 후 bar disappear 검증 — 250ms wait. |
| 6 | DR-design-012 의 primitive 확장이 다른 surface 에 영향 | Low | Low | `[data-quick-actions-bar]` attribute 만 추가 — 기존 visual / API 미변경. |
| 7 | 200ms grace 가 short / long 의 적응 안 됨 | Medium | Low | hover-card 표준 200ms 채택. 사용자 telemetry 의 v1.x 의 calibration. |
| 8 | LG-002 의 T-0 직전 broken 위험 | Medium | High | WI-035 의 회피 경로 (R/T/F hotkey + DropdownMenu + Alt+drag) 보존 — bar 가 broken 돼도 사용자 막힘 0. |

## Conditions

1. **Build 의 acceptance criteria 모두 PASS**: typecheck + declarativecheck + puritycheck + unit + e2e + visual smoke (bar 가 frame 의 top-left edge 의 시각 위치).
2. **회귀 0 의무**: WI-033 / WI-034 / WI-035 의 24 e2e + 기존 hover affordance 의 selected / delete / duplicate / replaceSrc 의 4 command 의 e2e 의무.

## Verdict

**GO WITH CONDITIONS** — 8 risk 중 5 mitigated by design (counter-scale, single source, stopPropagation, telemetry), 3 (build acceptance / 회귀 0 / T-0 broken) 의 condition. Build 의 self-verification 의무.

## Links

- WI-036, FR-007, DR-design-012 (의무 review).
- LG-002 의 P2 UX conditional close.
- WI-035 의 회피 경로 의 보존 의무.
