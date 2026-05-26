# WI-032 — Frame-only document model (paradigm shift)

## Metadata

| Field | Value |
|---|---|
| ID | WI-032 |
| Title | 4 도메인 kind (slide / canvas-design / block-doc / media) 를 단일 "frame" kind 로 통합. preset 은 초기 배치만, 모든 child 는 자유 편집 가능. |
| Owner | hbpark |
| Status | **Proposed** (사용자 결정 박제 2026-05-25 — domain fate=완전 제거, timing=v1 launch 전) |
| Severity | P0 (v1 launch paradigm 의 기초 — 이 변화 없이는 LG-001 의 design 의도가 안 맞음) |
| Created | 2026-05-25 |
| Target date | 2026-06-08 (LG-001 T-0 와 동일. 약 2 주) |
| Closed | — |

## Summary

weave 의 현재 모델은 4 개의 도메인 특수 kind 가 컨테이너 역할 + 자체 visual rendering 을 겸한다 — `slide` 는 `attrs.title` + `attrs.bullets[]` 를 자기 영역 안에 큰 헤더 + 글머리로 렌더, `canvas-design` 은 `attrs.shapes[]` 를 자체 렌더, `block-doc` 은 `attrs.paragraphs[]` 를 자체 텍스트, `media` 는 `attrs.caption` + `attrs.tone` 으로 자체 placeholder. 사용자가 이를 편집하려면 각 도메인의 inline 편집 UI (EditableText 등) 를 거쳐야 하고, 일반적인 primitive (image / video / shape / text) 와 다른 행위 — 즉 **자유 이동 / 리사이즈 / 회전 / 자유 child 추가** 가 부분적으로만 가능.

이 paradigm 을 **frame-only** 로 통합한다:
- 단일 kind `frame` 이 도큐먼트의 컨테이너. **자체 visual rendering 0** (단순한 사각형 + background, 그 외 빈 캔버스). child Items 를 자유롭게 담는다.
- 모든 visual content 는 primitive child Items (`image`, `video`, `shape`, `text`) 로만 표현.
- **Preset 시스템** (WI-030) 은 그대로 유지되지만 시멘틱이 변함 — "이 카테고리의 frame 초기 배치는 어떤 primitive 들이 어떤 위치로 들어가는가". 삽입 후엔 frame + 그 안의 모든 primitive 가 **일반 자유 편집** 대상 (위치 이동, 리사이즈, 회전, 추가, 삭제, 자기 자식 추가 등).
- 기존 4 도메인의 attrs (`title`, `bullets`, `shapes`, `paragraphs`, `caption`, `tone` 등) 는 자동 마이그레이션으로 primitive children 으로 변환 — 예: `slide { title:"X", bullets:["a","b"] }` → `frame` + text child "X" + text child "a" + text child "b".

## Scope

### In scope (v1)

- **새 kind `frame`** 정의. attrs = `{ frame: ItemFrame, background?: PaintSpec, label?: string }` 정도의 최소 구조. 자체 컨텐츠 0.
- **4 기존 도메인 kind 의 코드 제거**:
  - `slide` / `canvas-design` / `block-doc` / `media` 를 `DomainKind` 에서 제외. `frame` 으로 대체.
  - `SlideBlock.tsx` / `CanvasBlock.tsx` / `DocBlock.tsx` / `MediaBlock.tsx` 삭제 → `FrameBlock.tsx` 하나로 통합 (단순 `<div>` + background).
  - `ItemAttrsByKind` 에서 4 도메인 entry 제거.
  - seed.ts 의 `createDefaultItem` 의 4 도메인 분기 제거.
  - canvas-design 의 `attrs.shapes[]` 와 `weave.shape.update` / `weave.shape.remove` 명령 제거 (shape 는 이미 별도 primitive kind 로 존재).
- **자동 데이터 마이그레이션** (schemaVersion v9 → v10):
  - `slide { attrs: { title, bullets[], frame } }` → `frame { attrs: { frame } } + children: [ text(title), text(b1), text(b2), ... ]`
  - `canvas-design { attrs: { summary, shapes[], frame } }` → `frame + children: shapes[] 의 각 항목을 shape primitive 로 변환 + text(summary)`
  - `block-doc { attrs: { heading, paragraphs[], frame } }` → `frame + children: text(heading) + text(p1) + text(p2) + ...`
  - `media { attrs: { caption, tone, frame } }` → `frame + children: text(caption) + (tone='image' 이면 빈 image placeholder, tone='video' 이면 video placeholder)`
  - Migration helper `migrateLegacyKinds(doc)` in `storage.ts`. 기존 localStorage / KV 의 모든 디자인이 첫 로드 시 자동 변환 + 다음 저장 시 v10 으로 정착.
- **Preset 시스템 (WI-030) 의 적응**:
  - `Preset.factory()` 가 반환하는 root Item 의 kind 를 `slide` → `frame` 으로.
  - 기존 cover.{bold/hero/asymmetric} 3 preset 은 코드 한 줄 (kind: "frame") + Phase 1 의 SlideBlock 회피 가드 제거로 정리.
  - `weave.preset.insertSlide` → `weave.preset.insertFrame` 로 명령 이름 변경 (또는 별칭).
- **Flavor / FLAVOR_REGISTRY 단순화**:
  - 기존 `DocFlavor: "mixed" | "slide-deck" | "canvas-board" | "doc-page"` 는 frame-only 에서는 의미가 옅어짐. **v1 에서는 `"mixed"` 단일 flavor** 만 남김 (canvas paradigm). 나머지 flavor 는 deferred (v2 에서 "data-driven flavor" 로 재도입 가능).
  - new-design wizard 의 flavor 4 타일 → 1 타일로 단순화 + 또는 flavor 선택 단계 제거.
- **ThumbnailPanel + presentation-order 의 kind 의존성 정리**:
  - `flavorIconForKind` 가 4 case 의존했던 부분 제거. frame 은 단일 icon.
- **Selection chrome / FrameStage 의 isDomainItem 조정**:
  - `isDomainItem` 이 4 도메인 + primitive 5 종 (image/video/shape/text) 를 받는 구조였는데, 4 도메인 제거 후 = `frame` + 5 primitive.
- **Sync (WI-028) 호환성**:
  - Y.Doc 의 schema 도 v10 으로 bump. 마이그레이션 시 기존 Y.Doc 의 4 도메인 entry 도 자동 변환.
  - `applyPatchToYDoc` / `deriveDocumentFromYDoc` / `seedYDocFromDocument` 모두 frame kind 처리.

### Out of scope (v1)

- v2 의 "data-driven flavor" 컨셉 — flavor 는 frame 의 default child set + UI 추천 hint 로 재구현 (deferred).
- 4 도메인의 inline 편집 UX 보존 (EditableText 의 title 인라인 클릭→편집) — primitive text 의 일반 편집으로 대체.
- 4 도메인의 풍부한 default 시드 (slide 가 처음 추가될 때 "New slide" + 3 bullet placeholder 같은) — 신규 frame 추가 시엔 그냥 빈 frame, primitive 추가는 preset / 수동.
- canvas-design 의 `shapes[]` 배열 안의 도형 편집 UI — 일반 shape primitive 의 편집과 통합.
- block-doc 의 `paragraphs[]` 의 rich text 처리 — 일반 text primitive 의 Lexical 편집과 통합.

### Explicitly deferred

- "Smart presets" — 카테고리별 추천 v2.
- Frame group / nested frame 의 명시적 UI 표현 — 현재 paradigm 의 nested frame 동작 유지.
- Migration log 의 인스펙터 UI (사용자가 어떤 데이터가 어떻게 변환됐는지 확인) — v1.x.

## Acceptance criteria

### Default mandatory

- [ ] `pnpm verify` PASS — lint, tokencheck, declarativecheck (Rule 6), puritycheck, typecheck, test, build.
- [ ] `pnpm e2e` PASS — 신규 `frame-only-migration.spec.ts` 1 + 기존 e2e 모두 GREEN. 기존 e2e 가 slide 로 검증하는 곳은 frame 으로 재작성.
- [ ] `declarativecheck` — kind dispatch 의 `switch (kind)` 없음. FrameBlock 단일 컴포넌트.
- [ ] **마이그레이션 데이터 무손실** — 기존 디자인 (slide/canvas/doc/media 조합 어떤 것이든) 을 frame-only 로 변환 시 visual semantic 보존 unit test.
- [ ] Sync (WI-028) 호환 — Y.Doc 의 frame kind 마이그레이션 unit test.

### Feature-specific

- [ ] `DomainKind` 의 4 도메인 (slide/canvas-design/block-doc/media) 가 코드에서 사라짐. `frame` 추가.
- [ ] `ItemAttrsByKind` 에서 4 entry 제거, `frame` entry 추가.
- [ ] `SlideBlock.tsx` / `CanvasBlock.tsx` / `DocBlock.tsx` / `MediaBlock.tsx` 4 파일 삭제. `FrameBlock.tsx` 신규.
- [ ] seed.ts 의 `createDefaultItem` 가 `frame` kind 추가. 4 도메인 분기 제거.
- [ ] storage.ts 의 v9 → v10 마이그레이션 helper. 기존 디자인 첫 로드 시 자동 변환.
- [ ] `weave.shape.update` / `weave.shape.remove` 명령 제거. (canvas-design 의 attrs.shapes[] 의존이라 더 이상 의미 없음. 일반 shape primitive 의 `weave.item.update` 사용.)
- [ ] WI-030 preset 의 `Preset.factory()` 가 frame kind 로 root 반환. cover.{bold/hero/asymmetric} 3 개 동작 보존 (시각적 동일).
- [ ] `new-design` wizard 의 flavor 4 → 1.
- [ ] LG-001 의 launch gate review 갱신 (이 변화의 영향 반영).
- [ ] WI-029 / WI-030 의 진행 계획서 갱신.

## Context

- 사용자 (hbpark) 명시 2026-05-25: "실제 아이템들을 배치하는 방식. 기존 도큐먼트 레이아웃 구성처럼 고정되고 편집할수없는게 아니라 위치이동 리사이즈 같은 모든 동작이 가능. 최초 추가시만 같은 프리셋모양으로 추가. 기존 다큐먼트들을 다 제거하고 새로운 다큐먼트를 추가. 에디터에서 제공하는 모든 아이템들을 추가하고 편집할수있는 단순 프레임 역할."
- 현재 paradigm 의 충돌:
  - WI-030 Phase 1 의 visual fix 에서 SlideBlock 의 placeholder 가 child 와 시각 충돌 발견 → "slide kind 가 자체 렌더링을 가지면 preset 의 자유 배치와 본질적으로 안 맞는다" 가 증명됨.
  - 사용자 mental model: "도큐먼트 = 캔버스, primitive 가 자유 배치" 가 자연스러움. 4 도메인이 만든 시각 차별 (slide vs. canvas vs. doc vs. media) 은 결국 child primitive 의 배치 패턴 차이일 뿐.
- v1 launch (2026-06-08) 의 design 의도와 정렬 — preset → frame-only paradigm 으로 "어떤 시작점에서든 자유 편집 가능" 메시지가 명확해짐.

## Escalation triggers

- [ ] User data → 마이그레이션 (기존 디자인의 4 도메인 자동 변환). `risk-governance-review` 의무.
- [ ] Payment / billing → 없음.
- [ ] AI feature → 없음.
- [x] **UI / UX change** → 매우 큼. 모든 도큐먼트의 visual + interaction 변화. Design System Triage 필수.
- [x] **Public page** → LandingPage 와 demo 가 4 flavor 를 광고하던 부분 갱신 필요.
- [x] **Library / dependency** → agocraft 의 `ItemKind` 영향. agocraft 의 SHAPE_KIND / TEXT_KIND / IMAGE_KIND / VIDEO_KIND 는 유지, weave 의 4 도메인만 제거 (weave-local). agocraft 변경 0.
- [x] **Release** → LG-001 의 T-0 가 이 변화에 의해 영향. LG-001 record 의 conditional 항목 재평가 필요.

## Technical Feasibility verdict

- FR record: FR-005 (issue 예정)
- Verdict: TBD (FEASIBLE WITH TRADE-OFFS 예상 — 마이그레이션 + sync + WI-029/030 의존)
- 예상 Accepted trade-offs:
  - 기존 4 도메인의 inline 편집 UX (title 클릭→편집 등) 가 일시적으로 후퇴 — primitive text 의 일반 편집으로 통합.
  - 4 flavor 광고가 1 flavor 로 단순화 — 마케팅 surface 조정.
  - v1 launch 일정 위험 — 2 주 안에 마이그레이션 + 검증.

## Links

- Related Decision Records (DR-*): TBD (DR-019 paradigm shift 가능)
- Related Risk reviews (RISK-*): RISK-004 (issue 예정)
- Related Feasibility Reviews (FR-*): FR-005 (issue 예정)
- Related Handoffs (HANDOFF-*): 없음 (weave-local)
- Related Engineering Plan: `features/frame-only/ENGINEERING_PLAN.md` (예정)
- Related Launch Gate (LG-*): LG-001 (T-0 영향, 재평가 필요)
- 영향 WI:
  - WI-013 (frame manipulation) — frame kind 가 단일이 되면서 일관성 향상.
  - WI-028 (sync) — Y.Doc schema v10 마이그레이션.
  - WI-029 (text v1) — 4 도메인의 inline title 편집 흡수 (text primitive 가 모든 텍스트 담당).
  - WI-030 (preset) — root kind 변경, 시각은 유지.
  - WI-031 (corner radius) — frame kind 에도 자연스럽게 적용.

## Status updates

- 2026-05-25: WI 박제. 사용자 결정 = 4 도메인 완전 제거 + v1 launch (2026-06-08) 전 완료. FR-005 + RISK-004 + Engineering Plan 후속.
