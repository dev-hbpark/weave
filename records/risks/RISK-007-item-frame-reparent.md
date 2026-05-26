# RISK-007 — Item / Frame reparent (GO WITH CONDITIONS)

## Metadata

| Field | Value |
|---|---|
| ID | RISK-007 |
| WI | WI-039 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Verdict | **GO WITH CONDITIONS** |

## Risk inventory

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Cycle 생성 (자식 → 자기 조상으로 이동) → tree → 그래프 변형 | Medium | **Critical** (저장/직렬화 무한 루프, 문서 corruption) | 3 단계 방어: (a) 3 surface 모두 disabled UI 로 cycle 후보 제거, (b) command body 진입 시 `isDescendant(newParentId, itemId)` 검증, (c) agocraft reducer 의 patch 적용 전 동일 검증 (depth-first walk). 위반 시 err 반환 + patch 0. |
| 2 | 다중 reparent 의 비-atomic 적용 → 1/3 만 옮겨지고 history 중간에 broken state | Medium | High | 단일 `item.reparent` patch (multi-entry) — reducer 의 트랜잭션 boundary 가 entries 전체 또는 0. 부분 실패 시 전체 rollback, err 반환. e2e 가 의무. |
| 3 | Ratio 변환의 floating-point drift — 부모 변경 후 시각 위치가 미세하게 어긋남 | Medium | Medium | absoluteFrameBox(WI-038 P2 helper) 의 trail 합성 → 새 부모 inverse 변환 단일 식. 부모 1단계 reparent 의 unit test 의 픽셀 ± 0.5 tolerance, 다단계 trail 도 동일 검증. Round-trip identity: reparent → invert → 원위치의 ratio bit-equal 의무 (또는 ε < 1e-6). |
| 4 | Modifier 충돌 — 사용자가 Cmd+Shift+drag 를 다른 의미로 학습 / 다른 surface 가 점유 | Low | Medium | 박제: Alt = copy mode (RubberBandLayer), Shift = additive selection, Cmd = deep select 의 인접. Cmd+Shift 만 free 확인. 신규 surface 가 점유 시도 시 본 WI 의 박제로 PR review 의무. |
| 5 | Cmd+Z 가 reparent 의 *부분* 만 복원 (z-order index, frame ratio 둘 중 하나 누락) | Medium | High | invertPatch 단위 테스트 의무 — entry 별 (oldParentId, oldIndex, oldFrameRatio) 모두 inverse 에 포함. e2e 가 Cmd+Z 후 doc deep-equal 의무. |
| 6 | ThumbnailPanel 의 reorder drag 와 reparent drag 의 시각 충돌 — 같은 panel 영역에서 두 drag 가 헷갈림 | Medium | Medium | drag source 의 origin 분기: panel 내부 시작 = reorder (indicator: thumbnail 사이 line), main canvas 외부 시작 = reparent (indicator: thumbnail outline highlight). e2e 가 둘 다 검증. |
| 7 | Disabled thumbnail 의 affordance 가 사용자가 인지 못함 → 시도 → 무반응의 silent failure 인식 | Medium | Low | cursor: not-allowed + outline 50% opacity + tooltip "자기 자신/조상으로 옮길 수 없음" — 3 채널 affordance. |
| 8 | TreePicker 의 큰 디자인 (1000+ frame) 렌더 성능 | Low | Low | v1 = virtualization 없이 flat list (현재 weave 디자인 사이즈 100 frame 이하). v1.x telemetry 가 frame count > 500 발견 시 virtualization. |
| 9 | LG-001 T-0 (2026-06-08) 직전 머지로 회귀 | Medium | High | WI-039 의 deadline = LG-001 -3 (2026-06-05). 미달 시 v1.1 미루기 — non-blocker (회피 경로 = 지우고 다시 추가). |
| 10 | 회전된 ancestor 의 bbox 가 axis-aligned only — reparent 시 시각 위치 어긋남 (회전 무시) | Low | Medium | v1 한계 박제 (WI-038 의 hit-test 와 같은 한계). e2e 의 회전 케이스 = test.skip + v1.x todo. UI 의 tooltip "회전 컨테이너에서는 위치가 다를 수 있음" — v1.x. |

## Conditions

1. **Build 의 acceptance criteria 모두 PASS**: typecheck + declarativecheck + puritycheck + unit + e2e (4 신규 spec) + visual smoke (ghost preview / outline highlight / disabled thumbnail 시각).
2. **HANDOFF-002 응답 도착 + agocraft 의 patch variant publish**: Engineering Plan 의 Phase 1 (agocraft 의존) 미충족 시 weave Build 시작 불가.
3. **회귀 0 의무**: WI-032 frame-only / WI-033 figma-frame-ux / WI-038 zorder-restore 의 e2e 의 변화 없음. 잔여 17 알려진 flaky cluster 외 신규 fail 0.
4. **Cycle e2e 의무**: 자기 자신 thumbnail + 자기 조상 thumbnail + ContextMenu picker 의 cycle 후보 disabled — 모두 e2e spec.
5. **Cmd+Z 회복 e2e 의무**: 다중 reparent (2+ items) 의 단일 Cmd+Z 가 doc deep-equal 회복.
6. **DR-design-013 발행 + design-system primitive 머지**: TreePicker + ThumbnailDropTarget outline state. 머지 전 weave 측의 inline 컴포넌트 금지.
7. **회전된 ancestor 의 v1 한계 박제**: e2e test.skip + v1.x todo. 사용자 발견 시 RISK-007 §10 link 로 trace 가능해야.

## Verdict

**GO WITH CONDITIONS** — 10 risk 중 5 mitigated by design (3-tier cycle guard / multi-entry atomicity / invert 단위 / drag source 분기 / 3-channel affordance), 5 (build acceptance / HANDOFF-002 / 회귀 0 / cycle e2e / undo e2e) 의 condition. v1 한계 (회전 ancestor) 는 명시 박제 + v1.x backlog.

Critical risk (#1 cycle) 는 3 단계 방어로 충분. Critical impact 가 있으므로 condition #4 의 e2e 의무는 PR-blocker.

## Links

- WI-039, HANDOFF-002 발행 예정, DR-design-013 발행 예정.
- WI-038 의 absoluteFrameBox helper 재사용 (axis-aligned 한계 공유).
- LG-001 의 deadline -3 의 conditional close-out 후보.
- 관련 RISK: RISK-004 (frame-only paradigm), RISK-005 (figma-frame-ux selection).
