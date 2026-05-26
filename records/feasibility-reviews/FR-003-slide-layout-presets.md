# FR-003 — Slide layout presets (semantic-category × variant)

## Metadata

| Field | Value |
|---|---|
| ID | FR-003 |
| Title | "Slide → Semantic category → Preset" 3-level 추가 흐름 + multi-item layout 프리셋 24개의 기술적 실현 가능성 |
| Author | claude (technical-feasibility-agent role) |
| Status | Draft |
| Created | 2026-05-25 |
| Related WI | WI-030 |
| Related spec | `docs/product/SLIDE_PRESETS_SPEC.md` |

## Verdict

**FEASIBLE WITH TRADE-OFFS**

전체 시스템 — preset registry, multi-item batch insert (단일 history transaction), 3-level UI — 모두 현재 weave/agocraft 아키텍처에서 **추가 인프라 없이** 구현 가능. 다만 두 가지 trade-off 가 불가피하고, 한 가지는 의도적 scope 축소를 권한다.

## Boundaries explored

본 리뷰는 다음 5 가지 핵심 질문 (FR § 8 of spec) 을 코드 레벨에서 검증했다.

### F1 — multi-item batch insert 가 단일 history transaction 인가?

**답: 가능. 추가 코드 없이.**

근거:
- `applyChangeToDocument()` (`apps/web/src/document/agocraft-mirror.ts:155-222`) 의 `item.children` reducer 는 이미 `change.added` 배열을 순회하면서 `PendingCreationLookup` 으로 각 Item 을 stage 에서 꺼내 추가한다. 즉 **하나의 `item.children` patch 가 N개의 Item 을 한 번에 추가**할 수 있다.
- 동시에 `AgocraftItem.children` 은 재귀 구조다 (`apps/web/src/document/agocraft-mirror.ts:60-69` `toAgocraftItem` 의 `children: []` 필드). 즉 **slide Item 을 미리 children-populated 한 채로 stage** 하면, 단일 `item.children` patch (design root + slideId) 만으로도 전체 트리가 한 번에 들어간다.
- `editor.history.length` 가 +1 만 증가하고 `Cmd+Z` 한 번에 모든 child 가 함께 사라지는 동작은 `TransactionRunner` 의 단일 origin 보장으로 자동.

구현 방식 권장:
- 신규 command `weave.preset.insertSlide(presetId, containerId?)` 가 (a) preset factory 호출하여 slide AgocraftItem (children 포함) 생성, (b) `pending.stage(slide)` 1회, (c) 단일 `item.children` patch (design root, added=[slideId]) 반환.
- 기존 `weave.item.add` 의 `pending.stage` 1회 + 단일 patch 패턴과 완전 동일. 새 인프라 없음.

### F2 — slide 는 child Item 을 가질 수 있는가?

**답: 가능. Phase 11 paradigm 에서 이미 "모든 도메인이 Frame".**

근거:
- `apps/web/src/document/domains/index.ts:13` 주석: "Phase 11 — every domain is a Frame: it can have its own children (nested frames) rendered inside its rectangle, regardless of kind."
- `FrameStage.tsx:398` `const childFrames = item.children.filter(isDomainItem)` 가 slide 든 canvas 든 어떤 kind 의 Item 이든 `.children` 을 펼쳐 nested frame 으로 렌더한다.

다만 한 가지 미세 trade-off:
- `SlideBlock` 자체는 `attrs.title` + `attrs.bullets[]` 를 자기 영역 안에 렌더한다. preset 의 child Item 들은 slide frame **위에 겹쳐** 렌더되므로, preset 디자인 시 slide attrs (title/bullets) 와 child Item 들이 겹치지 않도록 한다 — 권장: **preset 의 slide attrs 는 `title: ""` + `bullets: []` 로 비워두고 child Item 들만 사용**. 이렇게 하면 child 가 슬라이드의 전체 영역을 자유롭게 사용 가능.

### F3 — 24 preset × 평균 6 child 의 bundle size

**답: 추정 ≤ 30 KB raw / ≤ 10 KB gz. 60 KB 예산 안전.**

대략 계산:
- 1 child Item 의 정의 = `{ id, kind, attrs: {frame, text/shape/...}, behaviors: [] }` ≈ 200-400 bytes 의 TS 코드 (factory 형태).
- 24 preset × 6 child × 평균 300 bytes ≈ 43 KB raw → 압축 후 ≈ 13 KB gz.
- preset 의 metadata (label LocalizedText, description) ≈ 100 bytes × 24 ≈ 2.5 KB raw.
- 합계 ~45 KB raw / ~15 KB gz. **60 KB gz 예산 대비 충분.**

권장: lazy chunk 로 분리하지 말고 main bundle 에 포함. 첫 슬라이드 추가 시 instant feel 이 더 중요. 만약 main 이 350 KB gz 초과 위험 발생 시 카테고리별 dynamic import 로 분리 (i.e., 카테고리 클릭 시 fetch).

### F4 — WI-029 Phase 1 schema 의존

**답: 의존 없음 (이미 머지 완료).**

근거:
- 메모리 `project_weave_wi029_foundation_2026_05_25` 와 `project_weave_wi029_r1_step3_phase_c_2026_05_25` 가 박제: WI-029 Phase 1 + Phase 1.5 schema (`textAlignHorizontal`, `lineHeightSpec`, `textRuns`, `textAutoResize`, …) 모두 머지됨. CURRENT_SCHEMA_VERSION=9.
- preset 의 텍스트 Item 은 이 schema 를 그대로 사용. R5 UI / R3 lazy-load 등 잔여 PR 은 preset 박제와 무관.

### F5 — 3-level menu UI

**답: 현재 design-system 으로 부족. Triage Step 3 (Grew) 의무 발생.**

근거:
- `packages/design-system/src/components/DropdownMenu.tsx` 는 radix 의 `Sub` / `SubTrigger` / `SubContent` 를 노출하지 않는다 (확인: `grep -n "Sub" DropdownMenu.tsx` = 0 hits).
- 옵션 1: design-system 에 `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` 노출 추가 → **DR-design-XXX 발행 의무**.
- 옵션 2: **3-level dropdown 대신 "preset picker dialog"** — Add menu 에서 "Slide" 클릭 시 Dialog 열기, Dialog 내부에 왼쪽 컬럼 = 카테고리 (8 chips), 오른쪽 grid = preset 썸네일. 이 형태는 기존 `Dialog` + `Card` + `RadioTileGroup` 으로 가능 (Triage Step 1 = Reused).

**권장: 옵션 2 (Dialog picker)**. 이유:
- 시각 preview 가 핵심이라 thumbnail 의 면적이 필요 (3-level dropdown 안에 작은 썸네일을 넣으면 식별 어려움).
- 8 카테고리 × 3 preset = 24 항목을 한 dialog 안에서 비교 가능 (cross-category browsing). 카테고리 클릭 시 우측 grid 가 swap.
- design-system 신규 primitive 0개. 기존 `Dialog` + 신규 weave-local 합성 컴포넌트 `SlidePresetPicker.tsx`.
- 추후 v2 의 search / AI 추천 / 카테고리 확장이 자연스럽게 dialog 안에 들어감.

옵션 2 채택 시 **design-system 변경 0** → DR-design 불요 (단순 host 합성). Triage Step 1 (Reused) 로 종결.

## Trade-offs (의도적)

1. **3-level dropdown 대신 picker dialog**. dropdown 의 "한 번에 끝까지 가는" 흐름을 포기하지만, 시각 preview 와 cross-category browsing 을 얻는다. 사용자가 "표지 → preset" 의 1초 흐름을 원했을 가능성 있음 — Build Phase 1 PoC 후 user-test 1회 권장.
2. **preset 의 slide attrs (title / bullets) 를 비움**. SlideBlock 의 빌트인 렌더링과 child Item 의 자유 배치가 충돌 — preset = child Item 으로만 표현. 이는 `slide` kind 의 v2 정체성 (Frame container) 과 자연스럽게 정렬.
3. **preset 자체는 정적 코드**. 사용자가 직접 만든 preset 의 cloud 저장 = v1 out-of-scope. 24개 박제 preset 의 코드 변경은 PR 필요.

## Open dependencies

- WI-029 R-잔여 PR (R3 lazy / R4 e2e / R5 UI) — preset 박제와 직교. 동시 진행 가능.
- LG-001 의 conditional close item 검토 — preset 머지 후 v1 launch 의 "빈 캔버스 friction" 항목 close 가능 → LG-002 에서 평가.

## Scope-reduction options (없음)

24 preset 전부 박제 가능. 다만 Build 단계에서 **Phase 분할 권장**:
- Phase 1 (PoC): registry + command + 표지 카테고리 × 3 preset + picker dialog skeleton.
- Phase 2-7: 나머지 카테고리 × variants (병렬 가능, 카테고리 간 의존 없음).
- Phase 8: visual regression snapshot 24개 박제.

## Decision

**FR-003 verdict = FEASIBLE WITH TRADE-OFFS**. WI-030 의 acceptance criteria 그대로 진행. Risk Review (RISK-002) 후 Engineering Plan 으로 넘어가도 무방.

선택 trade-off:
- T1 (Dialog picker vs. 3-level dropdown) → Dialog picker 채택 권장. PoC 후 user-test 결과로 재평가 가능.
- T2 (slide attrs 비움) → 채택. preset 의 slide 는 빈 Frame 으로 박제.
- T3 (정적 코드) → 채택. v2 에서 user-defined preset 추가.
