# WI-030 — Slide layout presets (semantic-category × variant)

## Metadata

| Field | Value |
|---|---|
| ID | WI-030 |
| Title | 슬라이드 추가 흐름을 "Slide → Semantic category → Preset" 3-level 로 재구성하고, 카테고리당 ~3개의 multi-item 레이아웃 프리셋을 묶어 제공 |
| Owner | hbpark |
| Status | **Proposed** (사용자 결정 박제 2026-05-25 — multi-item layout 스코프 + 정식 워크플로) |
| Severity | P2 (v1 launch 의 "빈 캔버스" friction 해소 — 일반 사용자의 60–80% 가 슬라이드 데크 만들기로 시작한다고 가정) |
| Created | 2026-05-25 |
| Target date | 2026-06-15 (Build 11 일 + Discovery/Feasibility/Plan 6 일 추정. WI-029 의 R-잔여 PR 과 병행 가능) |
| Closed | — |

## Summary

weave 의 "Add slide" 흐름이 현재는 한 단계 — `weave.item.add({ kind: "slide" })` 가 `title` + `bullets[]` 하나 들어있는 빈 슬라이드 한 장을 만든다. 사용자가 실제로 데크를 구성할 때는 "표지 → 아젠다 → 미션 → 문제 정의 → 해결 → 가이드 → 클로징" 같은 **의미 단위로 슬라이드를 고르고 싶다**. 또한 같은 의미라도 톤·시각 구성이 다른 변주가 보통 2–4개 있어야 "복붙 데크" 느낌을 피한다.

이 WI 는 (a) **8개 의미 카테고리** (표지·아젠다·타임테이블·미션·문제 정의·해결 방향·가이드·클로징) 를 **공식 카테고리**로 정의하고, (b) 각 카테고리에 **multi-item 레이아웃 프리셋**을 ~3개씩 등록할 수 있는 **open preset registry** 를 박제하며, (c) 슬라이드 추가 진입점 (Toolbar Add menu 와 ThumbnailPanel `+` 버튼) 을 **"Slide → Category → Preset"** 의 3-level 흐름으로 재구성한다. 각 프리셋은 **slide frame + 그 안의 child Item 들 (text / shape / image-placeholder)** 의 조합이며, 한 번의 user action 으로 **단일 history transaction** 에 들어가 `Cmd+Z` 한 번에 전부 회복된다.

## Scope

### In scope (v1)

- **Preset registry** — `apps/web/src/document/presets/` 신설. open extension point (등록 시점에 카테고리 + id + factory function 등록). 카테고리/프리셋 추가 시 `switch` 분기 없이 registry lookup 만.
- **8 공식 카테고리** + 카테고리별 평균 3개 프리셋 = 24개 프리셋 박제.
  - 표지 (cover): 3 variant
  - 아젠다 (agenda): 3 variant
  - 타임테이블 (timetable): 3 variant
  - 미션 (mission): 3 variant
  - 문제 정의 (problem): 3 variant
  - 해결 방향 (solution): 3 variant
  - 가이드 (guide): 3 variant
  - 클로징 (closing): 3 variant
- **신규 command** `weave.preset.insertSlide({ presetId, containerId? })` — 한 번 호출로 (slide frame Item 1 + child Item N) 를 `PendingCreations` 에 한꺼번에 stage 하고, 단일 `item.children` patch 로 history 에 들어간다. `Cmd+Z` 한 번으로 모든 child 까지 함께 사라진다.
- **3-level menu UI**:
  1. 진입점 = Toolbar 의 Add menu + ThumbnailPanel 의 "+ Slide" 버튼.
  2. Level 1 = kind 선택 (현재 흐름 유지). slide / canvas / doc / media.
  3. Level 2 = slide 선택 시 8개 의미 카테고리.
  4. Level 3 = 카테고리 선택 시 ~3개 프리셋 thumbnail (각 프리셋의 미리보기 SVG/CSS).
- **i18n** — 카테고리 / 프리셋 라벨은 `CommandMetadata.LocalizedText` 형식 (WI-026). 한국어 1st, 영어 fallback.
- **미리보기 썸네일** — 각 프리셋은 정적 SVG (또는 token-only DOM) 으로 본인의 silhouette 을 보여준다. 프리셋 factory 가 만들기 전에 렌더링되지 않음.
- **Undo / redo** — 단일 transaction. `Cmd+Z` → 슬라이드 + 모든 child 동시 제거. `Cmd+Shift+Z` → 동시 복원.
- **Sync (CRDT) 호환** — preset insert 는 결국 표준 `item.children` patch + 여러 `item.update` 시퀀스이므로 기존 sync wire (WI-028 paused 상태이지만 wire 자체는 존재) 가 그대로 transport.
- **Telemetry hook** (SVL gate 용) — `preset:inserted` event 에 `presetId`, `categoryId`, `childCount`. 어떤 프리셋이 실제로 쓰이는지 v1 launch 후 측정 가능하도록.

### Out of scope (v1)

- 사용자 정의 프리셋 저장 (user-created preset 의 cloud 저장) — v2.
- 프리셋 search / 자연어 인덱싱 — v2.
- 프리셋 별 색상 테마 (단일 프리셋이 light/dark variant 를 가지는 것) — v2.
- 프리셋 내부의 **이미지 자산** (사진/일러스트) 자체 제공. v1 은 image placeholder + 사용자 업로드 흐름만.
- 카테고리/프리셋 의 admin UI 편집 — v1 은 코드로만 정의.
- canvas-design / block-doc kind 의 preset — v1 은 slide kind 만. registry 자체는 kind-agnostic 이지만 v1 은 slide 만 등록.
- 다국어 — 한국어 + 영어만. 일본어/중국어는 v1.x.

### Explicitly deferred

- preset 의 A/B test 와 ranking — telemetry 가 데이터 확보된 후 별도 WI.
- preset 의 "스마트 자동 추천" (직전 슬라이드의 카테고리 보고 다음 후보 정렬) — v2.
- agocraft 로의 promotion (preset registry 가 horizontal value 를 보이면 agocraft 모듈로 승격) — feedback `feedback-shared-utilities-to-agocraft` 의 신호 ≥ 3 시 별도 WI.

## Acceptance criteria

### Default mandatory criteria

- [ ] `pnpm verify` PASS — `lint`, `tokencheck`, `declarativecheck` (OS Rule 6), `puritycheck`, `typecheck`, unit `test`, `build`.
- [ ] `pnpm e2e` PASS — playwright spec 신규 8개 (카테고리당 1개 + 통합 1개) 모두 GREEN. 시나리오 = "Add menu 열기 → slide 클릭 → 표지 카테고리 클릭 → 첫 preset 클릭 → 슬라이드 + 3 child Item 등장 → Cmd+Z 한 번에 전부 회복 → Cmd+Shift+Z 한 번에 복원".
- [ ] **New dispatch-by-kind surface**: preset registry 의 lookup 은 `Map<categoryId, Preset[]>` + adapter (factory function), `switch (presetId)` 없음. `bash tools/check_declarative_dispatch.sh` clean.
- [ ] **Library purity**: preset registry 가 host 쪽 (`apps/web/...`) 에만 의존하고 agocraft 패키지를 오염시키지 않음.
- [ ] **New design-system component**: 3-level menu 가 design-system 의 기존 `DropdownMenu` + `SubMenu` 로 가능한지 Design System Triage 진행. 새 primitive 가 필요하면 DR-design 발행.
- [ ] **agocraft promotion 신호 점검**: preset registry 가 horizontal value 를 가질 가능성 (각 kind 마다 다른 preset set) → 신호 ≥ 3 까지는 service-local 유지, 그 이후 별도 HANDOFF.
- [ ] Records 갱신 — 본 WI + FR-003 + RISK-002 + (필요시) DR-XXX + 본 디자인 리뷰 (필요시).

### Feature-specific criteria

- [ ] Add menu 의 "Slide" submenu 가 8개 카테고리 chips 를 표시 (Korean label).
- [ ] 각 카테고리 클릭 시 평균 3개 프리셋의 썸네일이 보임. 썸네일은 lazy-rendered (메뉴가 열릴 때만 paint).
- [ ] preset 클릭 → 1 user action 으로 단일 history entry 가 추가됨 (`editor.history.length` 가 정확히 +1).
- [ ] `Cmd+Z` 한 번에 슬라이드 + 모든 child 가 동시에 사라짐 (UI 상 깜빡임 없이).
- [ ] preset 의 child Item 들이 slide frame 안의 0..1 ratio 좌표로 정확히 배치 (외부로 잘리지 않음).
- [ ] preset 내부의 텍스트 Item 들은 WI-029 의 Phase 1 schema (`textAlignHorizontal`, `lineHeightSpec` 등 신규 필드 포함) 를 사용.
- [ ] 24개 프리셋 모두에 대해 visual regression snapshot (playwright `expect(...).toHaveScreenshot()`) 박제.
- [ ] **Accessibility**: 모든 프리셋의 텍스트 contrast 가 WCAG AA (4.5:1) 이상. CI check.
- [ ] **Bundle budget**: preset registry + 24 preset 정의 + 24 썸네일 SVG 합계 ≤ 60 KB gz (FR-002 의 80 KB 와 별개 라인). 초과 시 lazy chunk 로 split.

## Context

- 사용자 (hbpark) 가 2026-05-25 대화에서 명시: "weave의 슬라이드용 다큐먼트의 레이아웃을 다양하게 구성해두고 싶어, … 카테고리 → 프리셋중 선택 이런 흐름으로 추가하고 싶어".
- weave 의 v1 launch (LG-001) 가 conditional ready 상태이고, "text v1 self user-visible 100%" 까지 도달했지만, **"빈 슬라이드에서 무엇을 만들지" friction 은 미해결**. 사용자가 처음 데크를 만들 때 "표지부터 시작" 같은 진입 도움 부재.
- 경쟁 서비스 (Genially / Canva / Gamma) 는 모두 의미 단위 preset 을 제공한다. weave 가 이를 제공하지 않으면 "빈 캔버스 paradox" 로 churn 위험.
- WI-029 (text v1) 가 다른 PR 라인이지만, preset 의 텍스트 Item 들이 WI-029 schema 를 활용하므로 **WI-029 의 foundation 머지 (이미 완료)** 가 의존. R-잔여 PR 머지 전이라도 Phase 1 preset 정의는 가능.

## Escalation triggers

- [ ] User data → 없음 (preset 은 정적 데이터)
- [ ] Payment / billing → 없음
- [ ] AI feature → 없음 (v1 에서는 AI 추천 out of scope)
- [x] UI / UX change → `design-system-agent` triage 필수 (3-level menu)
- [ ] Public page → 없음
- [x] Library / dependency → preset 의 텍스트 Item 이 agocraft 의 TextAttrs schema 를 사용. dependency-pinning 변경 없음.
- [x] Release → v1 launch 의 conditional close item 이 될 수 있음. LG-002 에서 평가.

## Technical Feasibility verdict

- FR record: FR-003 (to be issued)
- Verdict: TBD (FEASIBLE 가정, trade-off 명시 예상)
- Accepted trade-offs (예상):
  - preset 의 "정답" 부여로 인한 사용자 다양성 손실 → 의도적으로 "1st suggestion" 톤 (UI 카피로 "이대로 시작" 이 아닌 "추천 시작점")
  - preset 내부 텍스트는 모두 한국어 기본 (영어 fallback 은 `LocalizedText`) → 다국어 확장 비용

## Links

- Related Decision Records (DR-*): TBD
- Related Risk reviews (RISK-*): RISK-002 (to be issued)
- Related Feasibility Reviews (FR-*): FR-003 (to be issued)
- Related Handoffs (HANDOFF-*): 현재 없음 (agocraft promotion 발생 시 추가)
- Related Incidents (INC-*): 없음
- Related Engineering Plan: `features/slide-presets/ENGINEERING_PLAN.md` (to be created)
- Related Launch Gate (LG-*): LG-002 (v1 launch 의 conditional close item 후보)
- Related WI: WI-026 (CommandMetadata — preset 라벨 i18n), WI-029 (text v1 — preset 내부 텍스트 schema)

## Status updates

- 2026-05-25: WI 박제. 사용자 결정 = multi-item layout 스코프 + 정식 워크플로. Discovery → Feasibility → Risk → Plan → Build 순서로 진행.
