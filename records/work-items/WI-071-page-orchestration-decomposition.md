# Work Item — WI-071

## Metadata

| Field | Value |
|---|---|
| ID | WI-071 |
| Title | 페이지 오케스트레이션 분해 — DesignPageBody / FrameStage God Component → view-model 훅 + 서브뷰 |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 |
| Created | 2026-06-01 |
| Target date | 2026-06-30 |
| Closed | — |

## Summary

[DR-027](../decisions/DR-027-page-orchestration-decomposition.md) 결정에 따라 `pages/DesignPage.tsx`의 `DesignPageBody`(~3000줄)와 `pages/FrameStage.tsx`의 `FrameStage` 함수(~1412줄, +`NestedFrame` ~677줄)를 view-model 훅(`use-*.ts`)과 서브뷰 컴포넌트로 분해한다. **동작 보존(behavior-preserving)** — `editor.exec` 변이 경로·외부 props/컨텍스트 계약 무변경. AUDIT-006/WI-063(도메인 *계산* 추출)과 별개의 축인 "오케스트레이션 크기/책임 경계" 부채를 해소한다.

## Scope

### In scope (Phase 게이트 순서)

**Phase 1 — DesignPage 로직 추출 (저위험→고위험 순)**
1. `use-design-save` (A: 저장/충돌/saveStatus/offline reconcile) — 가장 독립적, 패턴 시연용 첫 슬라이스.
2. `use-command-host` (K/L: commandContext·isEnabled/visibleWhen·multiSameParent·palette).
3. `use-frame-focus` (F: focus 2-stage·zoomToFrame·fitAll·`collectFocusGateIds` 흡수).
4. `use-design-hotkeys` (H: hand/select·V/H·Cmd+S·editorHotkeys).
5. `use-design-peek` (C: container 파생·permutation 병합·controller·드래그·hostRect).
6. `use-selection-chrome-registry` (D: slide bullet·resize/rotate·poly/line vertex·z-order adapter) — ref 안정성 패턴 통째 이동, 최고위험.
7. `use-item-add` (E: computeAddGeometry 호출부·addNewItem·"+" 메뉴·slide preset) — WI-063의 `add-geometry.ts` 순수 코어 위임 유지.

**Phase 2 — DesignPage 뷰 분리**
8. `view/DesignHeader.tsx` (인라인 `<header>` 툴바 전체).
9. `view/DesignCanvas.tsx` (FrameStage + 오버레이 마운트).
10. `view/DesignDialogs.tsx` (MediaSrc/PasteSpecial/conflict — WI-063 F-2b와 순서 조율).
11. `DesignPageBody.tsx` 오케스트레이터 ~250줄로 수렴.

**Phase 3 — FrameStage 분해**
12. `use-camera` (pan/zoom/fit·`nextPanForZoom` 순수 이관) + `use-viewport-culling`.
13. `use-frame-gesture-router` (pan/move/resize/rotate 호스트 등록).
14. `NestedFrame` → 별 파일, `perceivedLuminance`→`color.ts` 순수 이관(AUDIT-006 F-1 MED).

### Out of scope
- WI-063 잔여 F-2a/F-2b는 별 트랙(DR-027 follow-up 1로 순서만 조율).
- agocraft 측(AUDIT-003) 별 트랙.
- 동작/UX 변경 일체.

## Approach / Verification

- 각 슬라이스 추출 직후: `apps/web` typecheck exit 0 + `vitest`(document/unit) green + 관련 e2e green. 특히 `apps/web/e2e/history-*.spec.ts`(undo/redo), vertex 핸들, peek reorder 회귀 게이트(Continuous Self-Verification).
- 공유 ref(`addGeometryRef`/`setSelectedFrameIdRef`/`docInAgocraftRef`)는 오케스트레이터가 소유·주입 — ref→effect 짝을 통째 이동해 stale 클로저 회귀 방지.
- 호출부 시그니처·외부 계약 유지로 diff 국소화.

## Progress log

- 2026-06-01 — WI 발행. DR-027 Proposed.
- 2026-06-01 — **Phase 1 슬라이스 1(`use-design-save`) 완료.** `pages/design/hooks/use-design-save.ts` 신규 — manual-save 4-state machine + offline reconcile를 view-model 훅으로 추출(입력: `persistNowAwaitable`/`resolveLocalConflict`/`navigate`, 반환: `saveStatus`/`handleManualSave`/`conflictBusy`/`handleConflictSave`/`handleConflictDiscard`). `DesignPageBody` 인라인 ~65줄 → 훅 호출 ~12줄. 프레젠테이션 상수(`SAVE_GLYPH/TOOLTIP/TINT_BY_STATUS`)는 JSX 소유라 View에 잔류, `SaveStatus` 타입은 훅으로 이동·export. **동작 보존**(`editor.exec`/`useDesign` 경로 무변경). 검증: `apps/web` typecheck exit 0, vitest 334/334 green, biome 신규 파일 clean·DesignPage 순증가 0(사전 베이스라인 1err/22warn 유지). 패턴 확립(훅 시그니처·검증 루프) — 슬라이스 2(`use-command-host`) 진행 가능.
  - 잔여: save 클러스터 전용 e2e 없음(`history-*.spec.ts`는 undo/redo 대상). 이동 코드가 바이트 동치라 저위험 — 고위험 슬라이스 6(selection-chrome)에서 `history-*` 게이트 필수 적용.
- 2026-06-01 — **Phase 2 슬라이스 7(`use-item-add`) 완료 — Phase 1 로직 추출 종료.** `pages/design/hooks/use-item-add.ts` 신규 — WI-020 "+" add 메뉴 핸들러(`addNewItem`, ~95줄) + WI-035 R/T/L/F 툴-핫키 adder(`setItemAdder` 효과) + WI-030 slide-preset 다이얼로그 open 상태. **협력-훅(Surface E)**: orchestrator-소유 공유 ref 3개(`addGeometryRef`[geometry는 공유 canvasHostRef/screenToDesign 의존이라 잔류]·`selectedFrameIdRef`·`setSelectedFrameIdRef`) 주입. `selectedFrameIdRef`가 useSelection 직후(1385) 선언되므로 훅 호출을 그 뒤에 배치(원래 addNewItem의 lazy-ref 패턴 해소). 입력 8개(최다). **타입 출처 교정**: `DomainKind`/`ItemFrame`은 weave `"../document"` 배럴(@agocraft/core 직접 아님), `ShapeSubKind`/`defaultShapeSubAttrs`는 core. **Decommission sweep**: 마지막 소비처 이동으로 죽은 import 5개(`layoutChildFromTextAutoResize`·`ItemAdderKind`·`setItemAdder`·`cameraFitBox`·상수 `DEFAULT_TEXT_LINE_HEIGHT`) 제거. 검증: typecheck 0, 신규 훅 biome clean, DesignPage 베이스라인 1err/22warn 복귀, vitest 327/327. **e2e**: history-item-lifecycle(item.add/remove undo-redo)·shape-poly·shape-line-convert·line-endpoint-drag·shape-poly-vertex-edit **12 passed** + add-menu/repeat-add/figma-quickaction-add/text-item/qr-item 등 **51 passed**. `viewport-add-rule.spec.ts` 2건(text-add ratio/Fixed-mode) 실패는 stash 확인 결과 **커밋 베이스라인 1a5ba76(addNewItem 인라인)에서도 동일 실패** → 기존 이슈, 본 추출 무관(text-add 코드 byte-identical). **누계: DesignPage.tsx 4574→3877줄(−697), view-model 훅 7개 추출.**
- 2026-06-01 — **Phase 2 슬라이스 6(`use-selection-chrome-registry`) 완료 — 최고위험.** `pages/design/hooks/use-selection-chrome-registry.ts` 신규 — DR-023 전체 selection-chrome 등록(DR-018 slide bullet·기본 resize/rotate[frame/image/video/qr]·text auto-resize·shape line-subkind·DR-031 poly vertex·DR-025 line vertex) + WI-019 z-order capability adapter. **공유 ref hoist**: `docInAgocraftRef`(18곳 공유 live-doc 미러)를 DesignPageBody 최상단으로 hoist 후 `docRef`로 주입(TDZ 회피). **협력-훅(Surface E)**: `selectFrameRef`는 훅이 소유·반환, orchestrator가 useSelection 이후 `selectFrameRef.current = selectFrame` 할당. VM 클로저 byte-identical(`docInAgocraftRef.current`→`docRef.current`만 치환). **Rule 6 보존**: kind별 어댑터 등록, `switch` 무도입. 미사용 import 6개 제거. 검증: typecheck 0, 신규 훅 biome clean, DesignPage 베이스라인, vitest 327/327. **e2e**: history-* + shape-poly-vertex-edit·line-endpoint-drag/snap-close·line-selection-handles·vertex-delete·shape-line-convert·handle-fsm-resize·zorder-restore 등 **22 passed**. `frame-handles.spec.ts:32`(resize-drag) 1건 실패는 stash 확인 결과 **커밋 베이스라인 bf9c328(slice6 미포함)에서도 동일 실패** → 본 리팩터 무관 기존/환경성(headless drag) 이슈.
- 2026-06-01 — **Phase 2 슬라이스 5(`use-design-peek`) 완료** (커밋 bf9c328 이후, 브랜치 wi-071-page-decomposition). `pages/design/hooks/use-design-peek.ts` 신규 — peek 컨트롤러(usePeekMode) + permutation-merge reorder(유일 변이, editor.exec) + peekContainerId 상태 + `__weavePeek` dev 노출. **협력-훅(Surface E)**: `peek`이 selection 선언(useSelection L1373)보다 먼저(hitTestLifted L1120) 필요하므로 selection→container 파생 효과는 훅에 넣지 못하고, 훅이 `setPeekContainerId`를 반환해 orchestrator 효과가 구동. **공유 자원 잔류**: `canvasHostRef`/`hostRect`(hover·clipboard·좌표투영 공유)와 render-coupled 드래그 핸들러는 orchestrator/JSX에 잔류, 반환된 `peek` 참조. 입력은 getter 패턴(`getDocument: () => doc|null`, reparent controller 관례). 미사용 `usePeekMode` import 정리. 신규 훅 non-null assertion 제거해 biome clean. 검증: typecheck 0, **peek-mode e2e 6 passed**, DesignPage 베이스라인 유지, vitest 327(외부 사전삭제 `migrate-shape-to-line.test.ts` 반영 — 본 변경 무관, 전부 pass).
- 2026-06-01 — **슬라이스 1–4 e2e 무회귀 확인 + 위험-경계 체크포인트.** `peek-mode` + `history-hotkeys` + `history-item-lifecycle` e2e 실행: **7 passed, 2 skipped (exit 0)**. 슬라이스 1–4가 건드린 handMode/command-host/focus/save가 peek 모드·Cmd+Z/Shift+Z·Select/Hand/Peek 토글그룹에 무회귀임을 브라우저에서 검증. DesignPage 4574→4251줄(−323). **남은 슬라이스 5–7은 성격이 다름**(고위험 묶음): peek는 `canvasHostRef`/`hostRect`가 hover·clipboard·좌표투영과 공유되는 cross-cutting 자원이라 단순 이동 불가(Surface E 협력-훅 seam 적용 필요) + 변이(`editor.exec` reorder) + 드래그 핸들러가 PeekOverlay JSX에 깊이 결합; selection-chrome(6)은 ref 안정성 임계 + `history-*` e2e 필수; item-add(7)는 `addGeometryRef` 변이. → 슬라이스 1–4(독립·대부분 read-only)는 안전한 커밋 단위. 5–7 진입 전 리뷰/커밋 권장.
- 2026-06-01 — **Phase 1 슬라이스 4(`use-hand-tool`) 완료.** `pages/design/hooks/use-hand-tool.ts` 신규 — V/H hand/select 툴 토글(`handMode` vm.handTool 파생 + `setHandMode` + V/H 핫키 효과). **범위 정직화**: 원 계획의 `use-design-hotkeys`는 selection navigator·item adder·Cmd+S 브리지·editorHotkeys가 각각 미추출 클러스터(selectFrame/addGeometryRef 등)와 교차하므로, 슬라이스 4는 경계가 깨끗한 hand-tool만 추출하고 나머지 핫키 등록은 각 소유 클러스터 슬라이스로 이연. 미사용 `useEditorVM` import 제거. **동작 보존**(vm.handTool 단일 소스 무변경). 검증: typecheck 0, vitest 334/334 green, biome 신규 훅 clean·DesignPage 베이스라인 유지. 누계 슬라이스 1–4.
- 2026-06-01 — **Phase 1 슬라이스 3(`use-frame-focus`) 완료.** `pages/design/hooks/use-frame-focus.ts` 신규 — WI-039 2-stage z-order focus(dim/isolate/disabled gate 세트 + focusStage + zoom-to-frame/fit-all 카메라 핸들). 순수 함수 `collectFocusGateIds`(+JSDoc)를 훅 파일로 이동. 입력 3개(document/designWidth/designHeight), 반환 9개(focusedId 포함 — ThumbnailPanel `focusedId={focused?.id}` 소비 누락분 추가 발견·수정). **Decommission sweep**: 이동으로 죽은 `findTrailDeep`·`AgocraftItem`(슬라이스 2+3가 마지막 소비처) import 제거. `DesignPageBody` 인라인 ~120줄 → 훅 호출 ~17줄. **동작 보존**(read-only, 변이 없음). 검증: typecheck exit 0, vitest 334/334 green, biome 신규 훅 clean·DesignPage 베이스라인 1err/22warn 복귀. 누계: DesignPageBody에서 ~305줄 제거(슬라이스 1+2+3).
- 2026-06-01 — **Phase 1 슬라이스 2(`use-command-host`) 완료.** `pages/design/hooks/use-command-host.ts` 신규 — `commandContext`(CommandHostProvider/QuickActionBar 소비) + `dispatchCommand` + `multiSameParent`(MultiSelectionOverlay 소비) + 커맨드 팔레트 open 상태. `selectedKind`/`isTextEditing`은 훅 내부로 흡수(다른 소비처 없음). 입력 9개(document/selectedFrameId/selectedIds/canUndo/canRedo/hoverContext/clipboardHasItems/editor/bumpHistoryTick). **이름 충돌 해소**: design-system이 이미 `useCommandHost()`(컨텍스트 소비자)를 export하므로 신규 훅은 `useDesignCommandHost`로 명명. 미사용 import(`setPaletteOpener`/`useIsTextEditing`) 제거. `DesignPageBody` 인라인 ~120줄 → 훅 호출 ~14줄. **동작 보존**(`dispatchEditorCommand` 경로 무변경). 검증: typecheck exit 0, vitest 334/334 green, biome 신규 훅 clean·DesignPage 베이스라인 1err/22warn 유지. 누계: DesignPageBody에서 ~185줄 제거(슬라이스 1+2).
