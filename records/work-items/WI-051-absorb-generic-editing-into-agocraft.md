# WI-051 — weave 명령/헬퍼의 generic 편집 동작을 agocraft로 흡수 (host↔library 경계 재정렬)

## Metadata

| Field | Value |
|---|---|
| ID | WI-051 |
| Title | `commands.ts` / `agocraft-mirror.ts` 의 "agocraft 위 모든 에디터가 공유하는 기본 편집 동작" 을 라이브러리(agocraft)로 흡수하고, weave 는 도메인 어휘 + host glue 만 보유하도록 경계 재정렬 |
| Owner | hbpark |
| Status | **완료 — S1+S2+PendingCreations 제거 + S3 증분 1~5 전부(remove/reorder/reparent/dissolve/duplicate/layout/clipboard). DR-025 전체 흡수 종료, deferred 0** |
| Severity | P2 (아키텍처/기술부채 — 사용자 노출 버그 아님, 단 동작 이중구현 위험 + 2번째 host 비용) |
| Created | 2026-05-29 |
| Target date | — |
| Closed | — |

## Summary

weave 의 문서 변경 명령(`apps/web/src/document/commands.ts`, 1,869줄)과 mirror 리듀서/헬퍼(`apps/web/src/document/agocraft-mirror.ts`, 1,018줄)의 **대부분은 weave 도메인 동작이 아니라, agocraft 위에 올라온 모든 에디터가 동일하게 필요로 하는 기본 편집 기능**(add/remove/update/reorder/reparent/duplicate/clipboard/z-order/layout 명령 + patch→document 적용 + 트리/기하 헬퍼)이다. OS 원칙 *"라이브러리가 제공하는 기능의 동작 책임은 전적으로 라이브러리에"* (memory `feedback_library_owns_its_behavior`) 기준으로 현재 경계는 host(weave) 쪽으로 크게 새어 있다. 이 WI 는 해당 generic 동작을 agocraft 로 흡수하고, weave 에는 **메커니즘이 아닌 어휘**(kind 목록·theme token·preset·clipboard 스키마·`weave.*` 명령명·핫키 바인딩)만 남기는 경계 재정렬을 범위로 한다.

목표 결과(사용자/유지보수 관점): (a) 동일 동작의 이중구현 제거 — 특히 z-order 는 agocraft 에 이미 명령이 있는데 weave 가 평행 재구현함, (b) 2번째 agocraft host(이미 존재하는 `workspace/example-service`)가 patch 적용·트리 조작·reparent 기하를 재구현하지 않아도 되도록, (c) `PendingCreations` 사이드채널 + 그에 딸린 undo-staging 함정 제거.

## Context — 왜 지금

- 2026-05-29 사용자 요청으로 `commands.ts` + `agocraft-mirror.ts` 전체와 agocraft 가 이미 export 하는 surface 를 대조 검토함. 결론: 명령/헬퍼의 대부분이 라이브러리 도메인.
- **결정적 증거 1 — apply-reducer 부재(keystone).** agocraft 는 `Patch` 타입 / `invertPatch` / `patchToChange`(transaction-runner) 는 소유하나 **`applyPatch(doc, change) → doc` forward 적용은 소유하지 않는다.** 그래서 weave 의 `applyChangeToDocument`(mirror.ts L197~407)가 **9개 Patch variant 전부**(`item.attrs`/`unit.attrs`/`item.children`/`item.units`/`document.attrs`/`item.children.reorder`/`item.layout`/`item.layoutChild`/`item.reparent`)의 적용 의미를 재구현한다. patch 가 문서를 어떻게 변형하는지는 명백히 agocraft 의미론이다.
- **결정적 증거 2 — z-order 이중구현.** agocraft core 는 `packages/core/src/command/zorder-commands.ts` 에서 `agocraft.zOrder.moveToTop/moveToBottom/moveAbove/moveBelow` + `registerZOrderCommands(registry)` + `ZOrderCapability` 를 **이미 export** 한다. weave 는 그 capability 어댑터(`apps/web/src/document/zorder/design-frame.zorder.ts`, `createZOrderAdapter`)까지 만들어 놓고도, `commands.ts` L807~810 에서 `weave.item.bringForward/sendBackward/bringToFront/sendToBack` 를 raw `item.children.reorder` patch 로 **또** 만들었다. DR-021(agocraft) 이 의도한 패턴(라이브러리=명령+capability / host=kind 어댑터만)을 절반만 채택한 상태.
- **결정적 증거 3 — `item.create` 미사용.** agocraft 에 subtree-aware `item.create` patch(WI-018)가 이미 있으나 weave 리듀서는 미사용 → 대신 `item.children` + `PendingCreations` Map(commands.ts L81~97) 으로 신규 Item 형태를 사이드채널로 운반. 이 장치가 memory `feedback_compose_reparent_remove_stage_empty`(빈 프레임 stage) 의 undo-staging 함정의 근원.

## 분류 (Discovery 산출)

### A. agocraft 로 흡수 (generic 편집 동작)

| weave 자산 | 근거 | agocraft 목적지 |
|---|---|---|
| `applyChangeToDocument` 리듀서 전체 (mirror.ts L197~407) | Patch→Document 적용 = 라이브러리 의미론 | `@agocraft/core` `applyPatch` (신규) |
| `PendingCreations` (commands.ts L81~97) | `item.create` patch 채택 시 소멸 + undo-staging 함정 제거 | 위 리듀서에 흡수 |
| tree 헬퍼: `findItemDeep`/`findTrailDeep`/`findParentAndIndex`/`findDescendantSet`/`mapItemDeep`/`removeItemFromTree`/`insertItemIntoParent`/`stripChildDeep`/`addChild`/`removeChild`/`updateChild`/`reorderRootChildren` | 순수 트리 대수. core 엔 `findItem`/`findItemById`/`walkItems`/`countItems` 만 존재 | `@agocraft/core` model |
| 회전 인식 기하: `absoluteFrameTransform`/`computeReparentFrameRatio`/`absoluteFrameBox` + 행렬 헬퍼(matMul/matRotateAbout/matInverse/matApply) | 일반 공간 기하, 도메인 무관 | `@agocraft/spatial` (DR-022 로 이미 존재) |
| `weave.item.remove`/`items.remove`/`item.update`/`items.resizeMulti`/`behavior.update`/`addBehavior`/`removeBehavior`/`design.reorderChildren` | kind-무관 patch 생성 | core/editor 표준 command kit |
| `weave.item.bringForward/sendBackward/bringToFront/sendToBack` | **agocraft 에 동일물 존재** — weave 판 삭제, `registerZOrderCommands` + 기존 `design-frame.zorder` 어댑터 사용 | (이미 있음) |
| `weave.item.reparent`(cycle guard·dedupe 포함) + `weave.frame.removeKeepingChildren`(dissolve, WI-050) | 일반 구조 편집. `item.reparent` patch · layout `onReparent` 는 이미 agocraft | command kit |
| `weave.item.duplicate`/`items.duplicate`, `weave.clipboard.copy/cut/paste`(everything) | serialize→remapIds→stage (둘 다 이미 agocraft 프리미티브). Paste-Special 도 "source attrs 슬라이스를 타깃에 투영" 은 일반 메커니즘 | command kit (attr-key 어휘만 주입) |
| `weave.frame.setLayout`/`setItemLayoutChild`/`swapGridCells`/`swapFlexOrder`/`dropGridCell` | 본문이 전부 `getLayoutEngine().onX(...)` forward — 껍데기만 host | `@agocraft/layout` command kit |

### B. weave 잔존 (진짜 도메인/host) — 메커니즘은 agocraft 에서 주입

- `weave.item.add` 의 **seed 기본값 + camera-target order 스캔**(프레젠테이션 도메인), `weave.doc.reset`(라이프사이클)
- `weave.design.setBackground` 의 **theme-token StyleRef 해석**(`parseVarRef`), `weave.design.setPresentationOrder`(프레젠테이션 의미; 사실상 document.attrs write)
- `weave.preset.insertSlide` + `presets/`, `seed.ts`(`createDefaultItem`), `style/theme-tokens.ts`
- clipboard **transport**(BroadcastChannel/localStorage) + `"weave/items.v1"` 스키마 + `STYLE_ATTRIBUTE_KEYS`, behavior kind 목록(camera-target/hotspot/reveal-on-step/hover-effect/button-trigger/entrance-animation), `editor-hotkeys.ts`(UX 바인딩)
- `toAgocraftDocument`/`fromAgocraftDocument`/`toAgocraftItem`/`fromAgocraftItem`/`unitToBehavior`/`getBehaviors`/`isDomainItem`/`ensureRootStyleProvider` (weave↔agocraft projection — weave 도메인 매핑)

원칙: **라이브러리는 메커니즘, weave 는 어휘.** kind 이름·테마·프리셋·clipboard 스키마·`weave.*` 명령명·핫키는 weave 것. agocraft 는 project-neutral 유지(OS-root 규칙 + `puritycheck`).

## Scope

- **In scope:** 위 A 항목의 agocraft 흡수 설계/구현 + weave 측 채택(중복 명령 삭제, 흡수된 command kit / `applyPatch` / 헬퍼로 배선 교체). weave 의 `weave.*` 명령명·입력 타입·핫키는 유지하되 본문은 agocraft 프리미티브를 **조합**하도록 전환.
- **Out of scope:** B 항목(도메인/host)의 agocraft 이전 — 명시적으로 제외. agocraft 에 weave kind/theme/preset/clipboard-schema 하드코딩 금지.
- **Deferred:** 표준 command kit 의 SDK/MCP 노출(reuse 확정 후 별도 WI). Paste-Special attr-key 추상화의 일반화 정도(최소: weave 가 key set 주입).

## 권장 진행 시퀀스 (위험도 순)

1. **즉시(저위험):** weave z-order 4종 삭제 → agocraft `registerZOrderCommands` 채택(기존 `design-frame.zorder` 어댑터 재사용). tree 헬퍼 · reparent 기하를 core/`@agocraft/spatial` 로 이동(weave 는 re-export 또는 직접 import).
2. **중간:** `@agocraft/core` `applyPatch(doc, change)` 리듀서 + `item.create` 채택 → `PendingCreations` 제거. **가장 load-bearing / 위험** — undo 라운드트립 함정(memory 3건: compose_reparent_remove_stage_empty / weave_item_attrs_full_replace / yjs_bridge) 회귀 e2e 로 봉인.
3. **그 후:** `registerEditingCommands(registry, deps)` 표준 kit(deps = idGen[이미 token]·seedFactory·clipboardTransport·styleAttrKeys 주입) + `registerLayoutCommands`(@agocraft/layout). weave 명령은 kit 위 thin shell 로 재작성.

## Acceptance criteria

- [ ] 각 흡수 단계는 weave **e2e PASS** 로 닫는다 — `history-*.spec.ts`(⌘Z/⌘⇧Z 라운드트립), `clipboard-*.spec.ts`, `frame-dissolve.spec.ts`, layout/reparent 스펙. typecheck/build · flag-off 는 "동작함" 아님(memory `feedback_runtime_wire_not_just_algorithm`).
- [ ] `pnpm verify` PASS (lint/tokencheck/**declarativecheck**/**puritycheck**/typecheck/unit/build) — 양 프로젝트. 흡수 후 agocraft `.domain-purity` 에 weave sister-name leak 0.
- [ ] z-order: weave `commands.ts` 의 `makeZOrderCommand` + 4 명령 제거, UI/핫키가 agocraft kit 경유로 동일 동작(commands.test.ts L453~463 시나리오 회귀 green).
- [x] `applyPatch` 채택 후 `PendingCreations` 참조 0 (commands.ts + agocraft-mirror.ts), undo 무중복 e2e green. ✅ WI-024 Phase 2b (2026-05-29) — 심볼 0, e2e 25 passed.
- [ ] agocraft 흡수분은 typed 입력·stable error code·contract test·reference doc 동반(OS 원칙 "every public interface").
- [ ] 라이브러리로 이전된 cross-cutting 유틸은 service-local 아닌 agocraft 모듈로(memory `feedback_shared_utilities_to_agocraft`).
- [ ] 레코드 갱신: agocraft HANDOFF + (cross-team 아키텍처 결정이므로) DR 발행, 본 WI status update.

## Escalation triggers (check before starting)

- [x] **Library / dependency → Dependency Change routing.** agocraft 공개 surface 확장(신규 `applyPatch` / command kit / spatial 헬퍼) = 라이브러리 변경. agocraft 측 DR + vendor publish + weave adopt 라운드 필요.
- [ ] User data / Payment / AI / Public page — 해당 없음.
- [x] **UI / UX 영향 간접** — 명령 동작 자체는 불변(리팩토링)이나, 회귀 시 편집/undo 전 표면에 영향 → e2e 필수.
- [ ] Release — 단독 릴리스 게이트 아님(점진 PR). LG 영향 시 갱신.

## Links

- Related Decision Records (DR-*): **agocraft [DR-025](../../../agocraft/records/decisions/DR-025-absorb-generic-editing-surface.md)(흡수 결정, Accepted 2026-05-29 — Option A 채택 + S1/S2/S3 분할)**, DR-021(ZOrderCapability, 흡수 패턴의 선례), DR-005(capability registry), DR-013(factory functions), DR-022(@agocraft/spatial), DR-003/004(change model)
- Related Risk reviews (RISK-*): —
- Related Feasibility Reviews (FR-*): 불필요(현존 기술 재배치, 신규 능력 아님)
- Related Handoffs (HANDOFF-*): **agocraft inbox [HANDOFF-018](../../../agocraft/records/decision-handoffs/HANDOFF-018-from-weave-absorb-generic-editing.md)** (발행됨 2026-05-29, cross-project 정식 채널; 구현 다수가 agocraft 에 착지 — agocraft 의사결정 대기)
- Related Incidents (INC-*): —
- Related Engineering Plan: 단계별(시퀀스 1/2/3) 별도 작성 예정
- Related Launch Gate (LG-*): —
- 선행/관련 WI: WI-013(document swap, 명령 모델 기원), WI-038(z-order), WI-039(reparent), WI-041(clipboard), WI-042/WI-043/WI-047/WI-048(layout), WI-050(dissolve)

## Status updates

- 2026-05-29: Discovery 완료. `commands.ts`+`agocraft-mirror.ts` 전체 vs agocraft export surface 대조. apply-reducer 부재(keystone) + z-order 이중구현 + `item.create` 미사용 3대 증거 확인. 분류표(A 흡수 / B 잔존) + 3단계 시퀀스 확정. 구현 미착수.
- 2026-05-29: agocraft inbox 에 HANDOFF-018 발행(Option A/B/C + weave 권장 A + S1/S2/S3 시퀀스). **agocraft 의사결정 + DR 발행 대기** — agocraft 수용 시 agocraft WI 발행 후 S1 착수.
- 2026-05-29: **agocraft 가 HANDOFF-018 수용 — DR-025 Accepted(Option A, S1/S2/S3 분할).** S1 은 agocraft [WI-022](../../../agocraft/records/work-items/WI-022-absorb-generic-editing-s1-tree-geometry.md) 로 발행됨(트리 헬퍼→core, 기하→@agocraft/spatial, z-order 채택). weave 측은 vendor publish 후 adopt PR(이동 심볼 import + z-order 4종 삭제 + e2e 회귀 봉인) 으로 대응 예정.
- 2026-05-29: **S1 adopt 완료 (weave 측).** vendor core+spatial `1.0.0-rc.20260529085540` 채택(`apps/web/package.json` `file:` + **root `package.json` `pnpm.overrides` 둘 다** — overrides 가 importer 를 이김, 미갱신 시 install 이 bump 무시). `agocraft-mirror.ts`: exported 트리 헬퍼 8종 → `@agocraft/core` 위임 shim(R4, doc-level `updatedAt` 은 host 가 `bumpDocUpdatedAt` 로 재적용); 기하 3종 → `frameTrail`(단일 `attrs.frame` 추출) + `@agocraft/spatial.*FromTrail`. z-order: `design-frame.zorder.ts` 어댑터가 진짜 `item.children.reorder` Patch override, `commands.ts` 4 명령이 `agocraft.zOrder.*` 위임, raw `makeZOrderCommand` 삭제. **검증**: typecheck + unit 234 + commands 41 + zorder adapter 11 green. **e2e 는 이 환경에서 pre-existing fail**(HEAD 로도 동일 — `addFrame` setup race, 본 변경 무관). private 헬퍼(`mapItemDeep` 등)는 S2 reducer 가 계속 사용 → S2 에서 흡수 예정. R4 shim 1릴리스 잔존.
- 2026-05-29: **e2e 게이트 복구 (별도 작업, S1/S2 검증 enabler).** pre-existing e2e fail 의 root cause = `pnpm dev`(vite)가 `api/` 미서빙 + online → design 영속 안 됨 → 빈 seed. 해결: `prepareDesign` offline 강제(`navigator.onLine=false` init script) + `LocalDesignConflictDialog` "save" dismiss + deselect click `{5,5}`→`{5,100}`(헤더 가림) + frame-nesting 카운트 frame-stage scope + cloud 2 spec `online:true`. **full e2e 238 passed/0 failed.** 부수: agocraft editor `CapabilityRegistry` bind 실버그 수정(z-order enabler).
- 2026-05-29: **S2 adopt 완료 (weave 측).** core vendor `1.0.0-rc.20260529112109`(applyPatch) 채택. `applyChangeToDocument` 를 `applyPatch(doc, change, {now: nowIso()})` 위임으로 atomic 교체 — item/unit **ADD 만** 로컬(`applyChildrenAddLocal`/`applyUnitsAddLocal` + PendingCreations; 나머지 전 variant 라이브러리 소유). orphan 헬퍼(`removeItemFromTree`/`insertItemIntoParent`/`findItemInTree`) 삭제. **검증**: typecheck 0(yjs .d.ts iCloud 재추출 `--force`) + 234 unit + biome clean + **e2e 봉인 25 passed/0 failed**(frame-dissolve compose pitfall 포함 undo 라운드트립). 잔여: item/unit ADD 의 PendingCreations 완전 제거는 `unit.create` + add 명령 `item.create` emit(S2 follow-up/S3).
- 2026-05-29: **S3 증분 5 adopt 완료 (clipboard kit — agocraft WI-025, operator deferral override).** vendor core `1.0.0-rc.20260529232610` 채택. `commands.ts` clipboardCopy/Cut/Paste(~230줄) inline → `createClipboardCommands` 위임. weave 주입: transport adapter(clipboardStore — literal kind/optional items 를 kit 의 string kind/required items 로 normalize) + envelope(weave/items.v1 / APP_VERSION / SESSION_ORIGIN / Date.now) + resolvePasteFrame wrapper(exactOptional pointer) + `pasteSpecial`(weave 의 style/text/size/position handler 잔존 주입). kit 이 serialize+cap+paste-stack+remapIds+item.create/remove 소유. unused import 6종 정리. **검증: typecheck 0 + 50 unit + e2e 25 passed/1 skip/0 fail**(clipboard-items/frame-crosstab/paste-special/rich-text + editor-shortcuts). → **DR-025 전체 흡수 종료, deferred 0** — agocraft 가 apply + tree/geometry + 전 편집 명령(remove/reorder/reparent/dissolve/duplicate/zorder/layout/clipboard) 소유, weave 는 thin-shell + 도메인 어휘(behavior/preset/background/presentationOrder)만.
- 2026-05-29: **S3 증분 4 adopt 완료 (@agocraft/layout 명령 kit — agocraft WI-025).** vendor layout `1.0.0-rc.20260529230936` 채택. `commands.ts` 5 layout 명령(setFrameLayout/setItemLayoutChild/swapGridCells/swapFlexOrder/dropGridCell) inline → `@agocraft/layout` kit 위임(NAME + `getLayoutEngine` + `()=>LAYOUT_FEATURE_ENABLED`). kit 는 core 아닌 layout 패키지에(LayoutEngine 이 거기 있으므로). **검증: typecheck 0 + 50 unit + e2e 11 passed(option-drag/layout-child-props/multi-arrange/layout-relayout[setLayout→flex 재배치]/rotation-arrange-grid) + layout-relayout repeat×2 6/6 안정.** → **DR-025 S3 실질 완료** (copy/cut/paste 만 host-coupled deferred). agocraft 가 generic 편집 동작(apply + tree/geometry + remove/reorder/reparent/dissolve/duplicate/zorder/layout 명령) 전부 소유, weave 는 thin-shell + 도메인 어휘만.
- 2026-05-29: **S3 증분 3 adopt 완료 (duplicate — agocraft WI-025).** vendor core `1.0.0-rc.20260529224753` 채택. `commands.ts` duplicateItem(~55줄)/duplicateItems(~70줄) inline → `createDuplicateItemCommand`/`createDuplicateItemsCommand` 위임(NAME + MAX_PASTE_NODES 주입, offset default 0.02). **copy/cut/paste 는 host transport/schema 결합으로 의도적 deferred**(단일-host 에 speculative injection API 발명 회피). 공유 import(countSubtreeNodes 등)는 clipboard 가 계속 사용. **검증: typecheck 0 + 50 unit + e2e editor-shortcuts 13 passed(Cmd+D single+multi single-undo) + clipboard-items 4 + multi-edit-undo(copy/cut/paste 무회귀)**. 증분 4(@agocraft/layout kit) 잔여.
- 2026-05-29: **S3 증분 2 adopt 완료 (reparent/dissolve — agocraft WI-025).** vendor core `1.0.0-rc.20260529223500` 채택. `commands.ts` reparentItem(~100줄)/removeFrameKeepingChildren(~80줄) inline → `createReparentCommand`/`createDissolveFrameCommand` 위임. weave 주입: NAME + `computeReparentFrameRatio`(spatial 출처, mirror) + `onReparentLayout: (args)=>LAYOUT_FEATURE_ENABLED?getLayoutEngine().onReparent(args):[]`. cross-package 의존이 DI 라 core 는 spatial/layout-free 유지. dissolve compose 불변식(empty-frame carry + reverse invert)은 kit 소유 + contract test. 로컬 type/unused import 정리. **검증: typecheck 0 + 50 unit + e2e 12 passed(frame-dissolve repeat×2 4/4 안정)**. 증분 3(clipboard)·4(@agocraft/layout) 잔여.
- 2026-05-29: **S3 증분 1 adopt 완료 (command kit — agocraft WI-025).** vendor core `1.0.0-rc.20260529222150`(`registerEditingCommands` + editing-command 팩토리) 채택. `commands.ts` 의 removeItem/removeItems/reorderChildren 3 inline 본문을 `createRemoveItemCommand("weave.item.remove")`/`createRemoveItemsCommand("weave.items.remove")`/`createReorderChildrenCommand("weave.design.reorderChildren")` 위임으로 교체 — weave 는 명령 NAME 만 주입, tree-walk+patch 조립은 라이브러리 소유. 입력 shape/error code 동일(item-not-found/container-not-found/order-mismatch) → pure name-injection. unused named import 정리. **검증: typecheck 0 + commands.test 40 + layout-relayout 10 unit green + e2e 봉인 18 passed/0 failed**(history remove undo+redo, multi-edit-undo 배치, thumbnail reorder, clipboard, zorder). 증분 2(reparent/dissolve geometry-injected)·3(clipboard transport)·4(@agocraft/layout kit) 잔여. S3 의 N-host 가치는 미래 host 전제(현재 weave 단일-host, operator 결정으로 진행).
- 2026-05-29: **PendingCreations 완전 제거 완료 (agocraft WI-024 Phase 2b — S2 follow-up).** vendor `1.0.0-rc.20260529121812`(`item.create`/`unit.create`/`item.remove`/`unit.remove` 4 변종 + `serializeUnitSubtree`) 채택. `commands.ts` 11 site(add/remove/removeItems/addBehavior/removeBehavior/dissolve/preset/cut/paste/duplicate/itemsDuplicate)를 self-contained 변종으로 atomic 전환 — 각 site 가 `serializeItemSubtree`/`serializeUnitSubtree` 로 subtree carry. `PendingCreations` interface + `createPendingCreations` + `buildWeaveCommands`/`registerWeaveCommands` 의 `pending` param 삭제. `agocraft-mirror.ts` `applyChangeToDocument` = **순수 `applyPatch` 위임**(PendingCreationLookup/applyChildrenAddLocal/applyUnitsAddLocal/mapItemDeep/withRoot 전부 삭제). `use-design.ts`/`use-weave-editor.ts` applyChange 단일 인자. `commands.test.ts`+`commands-layout-relayout.test.ts` 재작성. **검증: typecheck 0 + 233 document unit green + e2e 봉인 25 passed/5 skipped/0 failed**(history add/remove undo+redo, frame-dissolve compose-undo, clipboard atomic undo, reparent-under-rotation, z-order root+nested, preset insert+drain). **PendingCreations side-channel 심볼 0 — Acceptance criteria 4번째 충족.** S1+S2 + full removal 완료. S3(`registerEditingCommands` kit + `registerLayoutCommands` thin shell)만 잔여.
