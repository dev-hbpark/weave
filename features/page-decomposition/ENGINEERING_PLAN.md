# ENGINEERING_PLAN — page-decomposition (WI-071 / DR-027)

Self-contained plan for decomposing the two page God Components. Behavior-preserving.

- Decision: [DR-027](../../records/decisions/DR-027-page-orchestration-decomposition.md)
- Work Item: [WI-071](../../records/work-items/WI-071-page-orchestration-decomposition.md)
- Audit context: [AUDIT-006](../../records/audits/AUDIT-006-2026-06-01-mvvm-layer-separation.md) (인접 축 — 순수 계산 추출, WI-063)

## 0. Goal / non-goal

- **Goal**: `DesignPageBody`(~3000줄) → 오케스트레이터 ~250줄 + 훅 7 + 서브뷰 5. `FrameStage` 함수(~1412줄) → ~300줄 + 훅 3 + `NestedFrame` 분리.
- **Non-goal**: 동작/UX 변경, `editor.exec` 변이 경로 변경, 외부 props/컨텍스트 계약 변경, 신규 의존성.

## 1. Target layout

```
apps/web/src/pages/
  DesignPage.tsx                 # export 진입점 (얇게 유지)
  design/
    DesignPageBody.tsx           # 오케스트레이터: 훅 조합 + Provider 트리 + 서브뷰 배치 (~250줄)
    hooks/
      use-design-save.ts             # A  저장/충돌/saveStatus/offline reconcile
      use-command-host.ts            # K/L commandContext·isEnabled/visibleWhen·palette
      use-frame-focus.ts             # F  focus 2-stage·zoom·fitAll·collectFocusGateIds
      use-design-hotkeys.ts          # H  hand/select·V/H·Cmd+S·editorHotkeys
      use-design-peek.ts             # C  container 파생·permutation 병합·controller·drag
      use-selection-chrome-registry.ts  # D  slide/resize/rotate/poly/line/z-order VM 등록
      use-item-add.ts                # E  addNewItem·"+" 메뉴·slide preset (add-geometry.ts 위임 유지)
    view/
      DesignHeader.tsx             # 인라인 <header> 툴바 전체
      DesignCanvas.tsx             # FrameStage + 오버레이 마운트
      DesignDialogs.tsx            # MediaSrc/PasteSpecial/conflict
  frame-stage/
    FrameStage.tsx                 # 함수 본문 ~300줄로 수렴
    NestedFrame.tsx                # 재귀 프레임 (~677줄 이동)
    hooks/
      use-camera.ts                # pan/zoom/fit (+ nextPanForZoom 순수 이관)
      use-viewport-culling.ts      # IntersectionObserver 컬링 레지스트리
      use-frame-gesture-router.ts  # pan/move/resize/rotate 호스트 등록
    color.ts                       # perceivedLuminance (AUDIT-006 F-1 MED)
```

> 비고: 디렉터리 이동(`pages/DesignPage.tsx`→`pages/design/`)은 import 경로 변경을 유발하므로, Phase 1/2 동안은 **기존 `pages/` 위치에서 in-place로 훅/서브뷰만 신설**하고, 모든 슬라이스 완료 후 마지막 커밋에서 디렉터리 정리(파일 이동)를 한 번에 수행해 diff 노이즈와 회귀 위험을 분리한다.

## 2. Cluster → hook source map (DesignPageBody 669–3658)

| 훅 | 현재 라인(대략) | 이동 단위 |
|---|---|---|
| use-design-save | 687–728, 1336–1418 | handleManualSave/ConflictSave/Discard, saveStatus flash effect, offline reconcile effect |
| use-command-host | 1781–1902 | commandContext, isEnabled/visibleWhen, selectedKind/multiSameParent useMemo, dispatch, palette state |
| use-frame-focus | 843–920, 1520–1648 | setSelectedFrameId, cycleFocus/clearFocus/zoomToFrame/fitAll, collectFocusGateIds, focus-stage effects |
| use-design-hotkeys | 1012, 1649–1721, 1903–1906 | setHandMode, V/H 핫키, Cmd+S, editorHotkeys 등록 |
| use-design-peek | 737–790, 934–1010, 1150–1200, 1482–1516 | reorderChildrenInContainer 병합, peek controller, peek drag state, hostRect ref, container 파생 effect |
| use-selection-chrome-registry | 791–921 | slide bullet handle, default resize/rotate VM, poly/line vertex VM, z-order adapter 등록 (ref 안정성 패턴 통째) |
| use-item-add | 542–547, 1019–1305 | addNewItem, computeAddGeometry 호출부(코어는 `document/add-geometry.ts` 위임), "+" 메뉴 핸들러, slide preset 상태 |

## 3. Shared-ref contract (Surface E — 협력 훅 seam)

오케스트레이터가 소유하고 훅에 주입하는 ref(절대 훅 내부에서 새로 만들지 않음):
- `docInAgocraftRef` — 라이브 문서 미러. selection-chrome-registry / peek / item-add 가 읽음(stale 방지의 핵심).
- `setSelectedFrameIdRef` (WI-065/DR-031) — vertex VM이 stale `selectFrame`을 잡지 않도록. frame-focus가 채우고 selection-chrome-registry가 읽음.
- `addGeometryRef` — item-add 가 computeAddGeometry 최신본을 "+" 메뉴 클로저에 노출.

규칙: ref는 오케스트레이터에서 생성 → 훅 파라미터로 전달, 또는 훅이 ref를 반환 → 오케스트레이터가 다른 훅에 전달. 이동 시 **ref + 그 ref를 갱신하는 effect + 읽는 effect를 같은 커밋에서 통째로** 옮긴다.

## 4. Invariants (must hold every slice)

- [ ] 모든 변이는 `editor.exec("weave.<verb>")` 경유 — 이동 중 우회/인라인 금지 (프로젝트 CLAUDE.md History 계약).
- [ ] `switch(kind)`/`if(type===)` 무도입 — selection-chrome는 DR-023 registry 유지 (Rule 6).
- [ ] 외부 props / 컨텍스트 Provider 계약 무변경.
- [ ] `window.__weave*` 진단 노출은 `import.meta.env.DEV` 게이트 유지 (apps/web CLAUDE.md).
- [ ] 서브뷰는 자신이 쓰는 props만 수령 — 전체 VM 주입 금지 (ISP).

## 5. Verification gate (per slice — Continuous Self-Verification)

1. `pnpm --filter @weave/web typecheck` exit 0.
2. `pnpm --filter @weave/web test`(vitest, document/unit) green.
3. 관련 e2e green — 슬라이스별 매핑:
   - use-design-save → `e2e/*save*`/persistence
   - use-frame-focus → focus/zoom e2e
   - use-design-hotkeys → hotkey e2e
   - use-design-peek → peek reorder e2e
   - use-selection-chrome-registry → **`history-*.spec.ts`(undo/redo) + vertex 핸들 + line endpoint** (최고위험, 필수)
   - use-item-add → add-item e2e
4. biome: 변경 파일 error/warning 비증가.
5. 라이브 런타임 확인(SVL): 헤더 툴바·undo/redo·vertex 드래그·peek 동작 육안/CDP 확인.

## 6. Sequencing rationale

저위험(독립) → 고위험(상태 소유 이동·ref 얽힘) 순. 슬라이스 1(`use-design-save`)로 **패턴을 확립**(훅 시그니처·ref 주입·검증 루프)한 뒤 동일 틀을 반복 적용. Phase 3(FrameStage)는 Phase 1–2(DesignPage) 완료 후 진입(DR-027 Dissent의 순차 합의).

## 7. Rollback

각 슬라이스는 독립 커밋. 회귀 발견 시 해당 슬라이스 커밋만 revert(동작 보존이므로 이전/이후 동치). 디렉터리 이동은 최종 단일 커밋으로 격리.

## Progress log

- 2026-06-01 — 플랜 수립. DR-027 / WI-071 발행.
- 2026-06-01 — Phase 1 슬라이스 1 완료: `use-design-save` 추출. typecheck 0 / vitest 334 green / biome 순증가 0. 상세는 WI-071 progress log.
- 2026-06-01 — **Phase 1 로직 추출 전체 완료 (슬라이스 1–7).** 7개 view-model 훅: use-design-save · use-command-host(useDesignCommandHost) · use-frame-focus · use-hand-tool · use-design-peek · use-selection-chrome-registry · use-item-add. DesignPage.tsx **4574→3877줄(−697)**. 3 커밋(bf9c328 / 1a5ba76 / 8d1e895), 브랜치 wi-071-page-decomposition. 전 슬라이스 typecheck 0 · vitest green · biome 신규 훅 clean·DesignPage 베이스라인 · 관련 e2e(peek-mode·history-*·vertex/line/shape·add-menu 등) green. 기존/환경성 실패 3건(frame-handles:32, viewport-add-rule:151/249)은 stash로 커밋 베이스라인에서도 동일 실패 확인 → 본 리팩터 무관. **남음**: Phase 2(뷰 서브컴포넌트 분리 + 오케스트레이터 ~250줄 수렴), Phase 3(FrameStage).
