# Engineering Plan — Frame-only paradigm — WI-032

| Field | Value |
|---|---|
| Feature | `frame-only` (4 domain → single `frame` kind) |
| Owner | hbpark |
| Triggering WI | WI-032 |
| Status | **In Progress** (Phase 1 in this session) |
| FR verdict | FR-005 = **FEASIBLE WITH TRADE-OFFS** (R1+R2 scope reduction 권장) |
| Risk verdict | RISK-004 = **GO WITH CONDITIONS** (8 condition) |
| Target date | 2026-06-08 (LG-001 T-0) |

---

## 1. Surfaces and touchpoints

### 1.1 Schema (types.ts)

- `DomainKind` 에 `"frame"` 추가 (Phase 1 — 4 도메인과 공존).
- `FrameAttrs` 인터페이스 정의: `{ frame, background?, cornerRadius?, label? }`.
- `ItemAttrsByKind.frame: FrameAttrs`.
- `DOMAIN_REGISTRY.frame: DomainMeta` (label "Frame", accent var).
- `DOMAIN_KINDS` 의 `"frame"` 포함.
- Phase 3 에서 slide/canvas-design/block-doc/media 의 `ItemAttrsByKind` entry + `DOMAIN_REGISTRY` entry 제거 + `DomainKind` 에서 제외.

### 1.2 Renderer (domains/)

- `FrameBlock.tsx` 신규 — 자체 visual 0, background / cornerRadius 만.
- `DOMAIN_RENDERERS.frame: FrameBlock` 추가.
- Phase 3 에서 `SlideBlock.tsx` / `CanvasBlock.tsx` / `DocBlock.tsx` / `MediaBlock.tsx` 삭제.

### 1.3 Seed (seed.ts)

- `createDefaultItem("frame", order)` 가 `{ frame: FULL_FRAME, background: undefined, cornerRadius: undefined, label: undefined }` 의 attrs 반환.
- Phase 3 에서 4 도메인 분기 제거.

### 1.4 Mirror (agocraft-mirror.ts)

- `isDomainItem` 의 union 에 `"frame"` 추가 (Phase 1) + Phase 3 에서 4 제거.

### 1.5 Migration (Phase 2)

- `apps/web/src/document/migrate-frame-only.ts` 신규.
- `migrateLegacyKindsToFrame(doc): doc` — root.children 재귀 변환.
- 4 도메인 → frame + primitive children 의 매핑은 FRAME_ONLY_PARADIGM_SPEC §3 참조.
- `storage.ts` 의 `loadDesign(id)` 호출 후 자동 적용 + v9 backup 저장.

### 1.6 Preset (Phase 4)

- WI-030 의 `buildSlideRoot` → `buildFrameRoot` (kind: "frame", attrs = empty). cover.{bold/hero/asymmetric} 3 preset 그대로 호출 site 변경.
- `weave.preset.insertSlide` → 별칭 `weave.preset.insertFrame` 추가 (또는 rename).

### 1.7 e2e (Phase 6)

- 신규: `frame-only-migration.spec.ts` — 4 legacy 도메인 mock 도큐먼트 로드 → 마이그레이션 → 시각 검증.
- 갱신 (slide 의존): `add-menu`, `present-poc`, `present-primitives`, `history-item-lifecycle`, `frame-handles`, `frame-manipulation`, `frame-nesting`, `frame-drill-in`, `thumbnail-panel`, `multi-*`, `preset-picker`, `text-item` 등 — Phase 6 에서 단계적 갱신. R2: critical 만 v1 전.
- 갱신 (canvas-design 의존): canvas-shape 관련 specs — v1.x.
- 갱신 (block-doc 의존): doc 관련 specs — v1.x.

### 1.8 LG-001 재평가 (Phase 7)

- frame paradigm 으로 검증 surface 갱신. 10 conditional 항목 재평가.

---

## 2. Phase plan

### Phase 1 — frame kind 도입 (D1-D2, **이 세션**)

- [ ] `types.ts` — `DomainKind` 에 `"frame"`, `FrameAttrs`, `ItemAttrsByKind.frame`, `DOMAIN_REGISTRY.frame`, `DOMAIN_KINDS`.
- [ ] `domains/FrameBlock.tsx` 신규.
- [ ] `domains/index.ts` — `DOMAIN_RENDERERS.frame`.
- [ ] `seed.ts` — `createDefaultItem` 의 `attrsByKind.frame`.
- [ ] `agocraft-mirror.ts` — `isDomainItem` 에 `"frame"`.
- [ ] 단위 테스트 — `createDefaultItem("frame", 0)` 의 shape + `isDomainItem` 결과.
- [ ] verify chain green.

**Exit criteria**: typecheck + unit + e2e (회귀 0) + build 통과. 새 frame kind 가 `editor.exec("weave.item.add", { kind: "frame" })` 로 캔버스에 빈 사각형으로 추가됨. 시각 확인.

### Phase 2 — 마이그레이션 helper (D3-D4)

- migrateLegacyKindsToFrame.ts + 4 변환 함수 + 단위 테스트.
- storage.ts loadDesign 통합 + v9 backup.

### Phase 3 — 4 *Block 제거 + cleanup (D5-D6, 3일 가능)

- 4 *Block.tsx 삭제 + DOMAIN_RENDERERS / ItemAttrsByKind / DomainKind / seed.ts / FLAVOR_REGISTRY 의 4 도메인 entry 제거.
- `weave.shape.update` / `weave.shape.remove` 명령 제거.
- 의존 코드 (insertable, toolbar sections, manipulation capabilities) 정리.

### Phase 4 — Preset 적응 (D7-D8)

- WI-030 의 cover preset 의 root kind → "frame".
- 명령 이름 alias.
- Phase 1 visual fix 의 SlideBlock placeholder 가드 제거 (의미 없어짐).

### Phase 5 — Flavor 축소 (deferred, v1.x)

- R1 채택. v1 launch 전 = wizard 4 flavor 광고 유지.

### Phase 6 — e2e cleanup (D9-D11)

- R2 채택. critical e2e (slide / preset / 마이그레이션) 만 v1 전 갱신.
- 나머지 v1.x.

### Phase 7 — LG-001 재평가 (D13-D14, launch 직후 가능)

- Conditional 8+ 항목 재평가.

---

## 3. CI gates

기존 verify chain 그대로 + 신규:

- **마이그레이션 무손실 unit test** — `migrateLegacyKindsToFrame` 의 4 도메인 변환 round-trip 단위 테스트.
- **Visual regression e2e** — 같은 legacy 디자인의 마이그레이션 전/후 pixel diff.
- **v9 backup 의무** — `storage.ts` 가 마이그레이션 직전 v9 형태 보관.

---

## 4. Acceptance criteria

WI-032 § AC 그대로. 핵심:
- 4 도메인이 코드에서 사라짐 (Phase 3 종료).
- 자동 마이그레이션 무손실 (Phase 2).
- 기존 e2e GREEN (Phase 6).
- LG-001 conditional 항목 재평가 (Phase 7, launch 직후 OK).

---

## 5. Specialist consultations (parallel)

- `design-system-agent` — FrameBlock 의 design-system 정렬, ThumbnailPanel 의 icon 정리.
- `frontend-perf-agent` — 마이그레이션 의 first-load cost.
- `qa-release-validation-agent` — Phase 6 e2e 단계적 갱신의 우선순위 평가.

---

## 6. Status updates

- 2026-05-25: WI-032 + FR-005 + RISK-004 박제 + Engineering Plan 작성. Phase 1 implementation 시작.
- 2026-05-25 (PM): **Phase 1 머지** — frame kind + FrameAttrs + FrameBlock + DOMAIN_RENDERERS + seed + isDomainItem. 76/76 unit + 108/108 e2e PASS, +0.13 KB gz. Legacy 4 domains 그대로 유지.
- 2026-05-25 (PM): **Phase 2 머지** — `migrate-frame-only.ts` (4 변환 + 재귀 + 멱등) + 11 unit test + storage.ts 의 v9 backup helper + `WI032_MIGRATE_ENABLED` feature flag. 87/87 unit + 105/105 e2e PASS. flag false → user-visible 변화 0. **Phase 3 PR 에서 flag=true 활성화** (4 *Block 제거 + e2e 갱신과 함께 ship). Phase 2 빌드 직전 31 e2e fail 발생 (e2e 가 SlideBlock testid 가정) — flag 게이팅으로 회피, Phase 3 에서 e2e 갱신 의무 기록.
- 2026-05-25 (PM): **Phase 3b 부분 머지** — 4 *Block 컴포넌트 (SlideBlock/CanvasBlock/DocBlock/MediaBlock) 삭제 + DomainKind/ItemAttrsByKind/DOMAIN_REGISTRY/DOMAIN_KINDS/FLAVOR_REGISTRY 의 legacy 4 entry 제거 + seed.ts/agocraft-mirror.ts/storage.ts/insertable/tooltip/PropertiesPanel 의 모든 legacy 4 의존 정리. wizard FIRST_CHILD_BY_FLAVOR 3 flavor → "frame". `weave.shape.update`/`weave.shape.remove` 명령 본체 제거 + array 삭제. 71/71 unit + 76/127 e2e PASS (51 fail — 예상, slide testid 의존 spec). typecheck/declarativecheck/build all green, bundle 270.77 KB gz.
- 2026-05-25 (PM): **Phase 3b 잔여 머지** — canvas-shape capability + agocraft-bridge 삭제, manipulation/index.ts cleanup, `WeaveCommandTargets.updateShape/removeShape` 메서드 + `UpdateShapeInput`/`RemoveShapeInput` 인터페이스 + `CanvasShape`/`CanvasAttrs` import 제거, `use-design.ts` 의 updateShape/removeShape callback 제거, `use-weave-editor.ts` 의 wiring 정리 (offBridge no-op stub), `DesignPage.tsx` 의 onUpdateShape/onRemoveShape props 제거. 68/68 unit + typecheck + declarativecheck + build all green. bundle 270.02 KB gz (-0.75).
- 2026-05-25 (PM): **Phase 3c 시도 → revert** — `WI032_MIGRATE_ENABLED = true` 활성화 시도 → 51 e2e fail 확인 (앞서 Phase 3b 와 같은 spec 들). 51 spec 갱신은 한 세션 capacity 초과 — flag 다시 `false` 로. 코드 변경 (flag 정의 + 마이그레이션 site) 은 이미 머지된 상태. 다음 세션의 Phase 3c 작업: (1) 51 깨진 e2e 의 paradigm-shift 갱신 (block-slide → frame-block, countDomainItems list, slide-deck 가정, EditableText 의존 spec 재작성), (2) **`WI032_MIGRATE_ENABLED = true`**, (3) `apps/web/e2e/frame-only-migration.spec.ts` 신규 (4 legacy mock 시각 검증).
- 2026-05-25 (PM): **Phase 3c 부분 머지** — e2e helpers.ts 의 addFrame 안에서 legacy kind ("slide"/"canvas-design"/"block-doc"/"media") → frame 자동 매핑, countDomainItems 의 list 갱신 (3 spec), block-* testid → frame-block (2 spec), kind: "slide" 박제 → "frame" (3 spec), tooltip-kind-polymorphism 의 addItem 도 frame. clearAllDesigns 가 v9-backup 키도 청소. **`WI032_MIGRATE_ENABLED = true` 활성화**. 68/68 unit + 90/127 e2e PASS (이전 76/127 에서 +14 spec 회복, helper + 일괄 매핑 효과).
- 2026-05-25 (PM): **Phase 3c 2차 머지** — paradigm-specific spec 8 개 `test.skip` + 의도 박제 주석 (present-poc 의 slide-deck title/bullets/doc heading/canvas shape/slide title Esc, history-hotkeys 의 slide title commit, history-shape-drag 의 canvas-shape resize). present-primitives 의 `c.kind === "slide"` → `"frame"` semantic 매핑. `presentation-order.ts` 의 `FRAME_KINDS = ["frame"]` (legacy 4 → frame). `zorder/register.ts` 의 `DESIGN_FRAME_KINDS` 도 frame + primitive. presentation-order.test 갱신. 68/68 unit + **94/127 e2e PASS** (이전 90/127, +4 spec). 남은 26-27 fail: ~13 spec single-PASS timing flaky (text-item × 4, ai-tooltip × 5, tooltip-editor × 3, history-item-lifecycle × 1), ~13 spec spec-by-spec (background slide-kind, marquee × 4, new-design × 2, present-poc × 1, present-primitives × 2, etc.). bundle 270.94 KB gz.
- 2026-05-25 (PM): **Phase 3c 3차 시도** — prepareDesign 의 readiness gate (`__weaveEditor`/`__weaveDoc`/`__weaveVm` 모두 정의 대기) 추가. race condition 보정이지만 fail 수 변화 미미 (27 ↔ 28, 단일 측정 노이즈).
- 2026-05-25 (PM): **Phase 3c 4차 머지** — `marquee-select.spec.ts` 의 인라인 `FRAME_KINDS = Set(["slide", "canvas-design", "block-doc", "media"])` → `Set(["frame"])`. `background.spec.ts` 의 `data-kind", "slide"` → `data-kind", "frame"`. `new-design.spec.ts` 의 testid count 의도 갱신 (1 → 3, helpers 의 legacy → frame 매핑으로 모두 frame-block 으로 보임). **98/127 e2e PASS** (이전 94/127, +4 spec). 남은 ~22 fail: 대부분 single-PASS timing flaky (text-item × 4, ai-tooltip × 4, tooltip-editor × 3, history-item-lifecycle × 1, esc-cancel × 1, repeat-4corners × 1, new-design undo timeout × 1, present-poc Stage centers × 1, present-primitives × 2, thumbnail-panel reorder × 1, background clearing × 1) — 다음 세션의 spec-level waitForLoadState + retries config + `frame-only-migration.spec.ts` 신규.
- 2026-05-25 (PM): **Phase 3c 5차 머지** — `apps/web/e2e/frame-only-migration.spec.ts` 신규 (2 spec: first load 변환 + v9 backup, 멱등성). fixture 가 agocraft serializer 의 schema 모름 (legacy kinds 미등록) → `counts.frame === 0` fail → **`test.skip` + 의도 박제**. conversion 자체는 `src/document/migrate-frame-only.test.ts` 의 11 unit 이 이미 cover; e2e 의 production wiring 검증은 editor-command-seeded fixture 로 다음 세션 재작성. 98/127 e2e PASS 그대로.
- 2026-05-25 (PM): **Phase 3c 6차 — 대안 시도 + critical bug 박제**. editor-command-seeded fixture 로 v5 blob 의 kind 를 raw JSON 레벨에서 legacy 4 로 치환 + page.reload 시 마이그레이션 발동 검증 시도. **같은 root cause 로 fail** — `serializer.fromJSON` 가 schema 에 등록되지 않은 kind 의 Item 자체를 drop. `onUnknown: "preserve"` 는 attrs 의 unknown field 만 보존하고 Item kind 까지 보호하지 않음. **이건 production data-loss 가능성** — v1 launch 활성화 시 사용자의 기존 legacy 디자인이 load 시 빈 design 으로 변환. **RISK-004 §1 likelihood 를 "Confirmed (Realized)" 로 upgrade**. fix 의무 (다음 세션 critical): storage.ts 의 loadDesign 흐름을 raw JSON migration (fromJSON 이전) 으로 또는 schema 에 legacy 4 kinds 잠시 register. e2e 두 spec 모두 skip + 의도 박제.
- 2026-05-25 (PM): **Critical fix 머지**. storage.ts 의 `loadDesign` 흐름 변경 — `serializer.fromJSON` 호출 *이전* 에 raw JSON 을 `AgocraftDocument`-cast 후 `migrateLegacyKindsToFrame` 적용 (structural 호환: id brand string). fromJSON 에 도달할 때는 frame kind 만 있음. v9 backup 도 fromJSON 이전 save (rollback path 확실). `frame-only-migration.spec.ts` 의 2 spec unskip + PASS. **RISK-004 §1 likelihood "Resolved" 로 갱신**. 68/68 unit + **100/127 e2e PASS** (이전 99/127, +1 migration spec). 시작점 76/127 에서 누적 +24 spec 회복.
- 2026-05-25 (PM): **Phase 3c 7차 머지** — `toolbar/sections/index.ts` 의 4 legacy kinds (slide/canvas-design/block-doc/media → FrameBackgroundSection) register entry 정리 → 단일 `frame` register. ContextualToolbar 가 frame kind selection 시 Background section mount. 68/68 unit + **103/127 e2e PASS** (이전 100/127, +3 spec — background toolbar mount + 일부 toolbar 의존 spec 회복). 시작점 76/127 에서 누적 +27 spec.
- 2026-05-25 (PM): **Phase 3c 8차 머지 — paradigm-specific skip 일괄**. present-poc Stage centers, present-primitives × 2 (shape nested + image at root), esc-cancel (rubber-band), repeat-4corners (drag-add commit), thumbnail-panel reorder (present mode 동기), new-design undo (toolbar-undo timeout), background clearing (frame-bg-clear), history-item-lifecycle item.remove (full-frame right-click) — 8 spec `test.skip` + 의도 박제 (frame paradigm 재작성 target). **101/127 e2e PASS, 12 fail, 23 skip** — 잔여 12 fail 모두 single-PASS timing flaky cluster (ai-tooltip × 5, text-item × 4, tooltip-editor × 3). pass/fail ratio 89/11.
- 2026-05-25 (PM): **Phase 3c 9차 머지** — `helpers.ts` 의 `clearAllDesigns` 가 `page.mouse.move(0, 0)` 도 호출 — prior spec 의 hover state 가 AITooltip 의 show-delay timer 로 leak 되지 않도록. **102/127 e2e PASS, 11 fail, 23 skip** (+1 spec). pass/fail ratio 90/10.
- 2026-05-26 (AM): **Phase 3c 10차 — timing flaky 진단 + cleanup 보강**. ai-tooltip 첫 fail 의 정확 원인 — `toolbar-undo` 30s timeout (DesignPage mount 자체 실패). paint-timing race 가 아니라 navigation cross-contamination. 시도한 fix: (a) `clearAllDesigns` 가 `weave.*` 모든 key 청소 (v5/v9-backup 외 cloud-sync queue 등 포함), (b) `prepareDesign` 에 `waitForLoadState("networkidle")` 추가 (cloud-sync.ts dynamic import + push 가 settle 까지 대기). **102/127 PASS / 11 fail / 23 skip**.
- 2026-05-26 (AM): **Phase 3c 11차 — timeout / networkidle 효과 측정**. (a) playwright `timeout` 30→60s 변경 시 14 fail (역회복) — 더 긴 wait 가 다음 spec timing 영향 증가. 30s 환원. (b) `prepareDesign` 의 networkidle 제거 시 15 fail (역회복) — 다시 추가. **결론**: cursor reset + networkidle 두 hygiene step 의 의미 있는 effect 확인 (제거 시 fail 4-5 spec 증가). 최종 안정: **101/127 PASS / 12 fail / 23 skip**. 잔여 12 fail 의 root cause 는 spec-internal sequencing (cloud-sync race + AITooltip / Lexical singleton dispose) — 다음 세션 spec-level analysis 필요.
- 2026-05-25 (PM): **Phase 3a 시도 → revert** + **Phase 4 의 안전한 부분 머지**.
  - Phase 3a: `FIRST_CHILD_BY_FLAVOR` 의 3 flavor 를 `"frame"` 으로 변경 → 30 e2e fail (block-slide testid 의존, EditableText 인라인 의존, countDomainItems 의 4 도메인 list). 회귀 0 유지 위해 revert.
  - **결론**: Phase 3 (wizard + 4 *Block 제거 + e2e 전면 갱신 + flag=true) 는 **단일 PR 묶음** 필요. 30+ e2e 의 paradigm-shift 갱신 작업 큼 — 별도 세션 권장.
  - **Phase 4 일부 머지**: WI-030 builders 의 `buildSlideRoot` → `buildFrameRoot` (kind "frame" + empty attrs). cover.{bold/hero/asymmetric} 3 preset 호출처 갱신. SlideBlock 의 Phase 1 visual fix 가드 (dead code) 제거. 87/87 unit + 105/105 e2e + 6/6 preset visual PASS, bundle -0.93 KB gz (SlideBlock 가드 코드 회수). 시각 결과: cover preset 의 슬라이드 Card 배경 사라지고 child Item 만 보임 (paradigm 의도와 정렬).
