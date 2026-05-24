# Decision Record — DR-014 ContextualToolbar (Canva-style) + selection-driven property editing

## Metadata

| Field | Value |
|---|---|
| ID | DR-014 |
| Title | 선택된 item의 kind에 따라 헤더 아래 중앙 정렬 Canva 스타일 floating toolbar를 mount, 도메인별 속성 편집기를 노출. 다중 선택은 1차 라운드 deferred. |
| Status | Proposed |
| Owner | hbpark |
| Triggering Work Item | WI-020 |
| Pairs with | agocraft DR-023 (item primitive schemas), agocraft DR-024 (shape sub-kinds), agocraft WI-015, weave HANDOFF-006, weave DR-design-009 |

## Context

agocraft WI-015가 3 신규 item kind (image / video / shape) + 10 shape sub-kinds + 4 visual specs를 cross-host 표준화. weave는 이를 consume해 사용자가 디자인 캔버스에 미디어와 도형을 추가하고 **선택 후 즉시 속성을 편집**할 수 있게 해야 함. 핵심 UI 정책 3 결정:

1. **Toolbar 위치 / 동작 패턴** — Canva 스타일 floating bar vs Figma 스타일 fixed right panel vs Photoshop 식 dockable
2. **Selection-driven content** — 어떤 item kind / 어떤 sub-kind 일 때 어떤 속성 편집기가 노출되는가
3. **Multi-selection 정책** — N개 선택 시 toolbar 동작

## Decision A — Toolbar 위치 / 동작: Canva 스타일 floating top-center

**채택: Canva 스타일 floating top-center bar.**

```
┌─ Header (편집 도구) ──────────────────────────────────────────────┐
│  [V] [H] [L]      [↺] [↻]                          [Present]   │
└───────────────────────────────────────────────────────────────────┘

         ┌─ ContextualToolbar (selection 존재 시 자동 mount) ─┐
         │  [Fill] | [Stroke] | [Opacity ◯─] | [↻] [⋯ More]  │
         └────────────────────────────────────────────────────┘

┌─ Canvas ──────────────────────────────────────────────────────────┐
│                                                                   │
│         [selected item]                                           │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

- 위치: `position: absolute; top: ~12px; left: 50%; transform: translateX(-50%)`. 헤더(48px) 바로 아래, 화면 가운데.
- 폭: 자식 콘텐츠 fit (auto). max-width로 viewport overflow 방지.
- z-index: 헤더(20)와 selection-chrome(50) 사이의 적당한 값 (예: 30~40).
- Selection이 비어있으면 mount 안 함 (DOM out).
- 단일 선택 → 그 item의 kind/sub-kind에 맞는 editor.
- Hover / focus 시 자체 backdrop-blur로 살짝 떠 있는 느낌. drag으로 위치 이동 (v2 deferred).

근거 (vs alternatives):
- **Figma 스타일 right panel** — 가용 공간 손실 + 디자인 캔버스 폭 축소. Canva는 캔버스를 최대화하면서 컨텍스트별 도구만 노출하는 게 강점이라 weave도 같은 접근.
- **Photoshop 식 dockable** — 복잡도 ↑. 본 라운드 scope 외.

## Decision B — 도메인별 속성 편집기 매핑

| Item kind / sub-kind | Toolbar 섹션 (순서대로) |
|---|---|
| **image** | Fit (Cover/Contain/Fill/None) · Crop · Filter (Brightness/Contrast/Saturate) · Border radius · Opacity · Shadow · 정렬/회전/More |
| **video** | Fit · Play settings (Autoplay/Loop/Muted) · Trim · Volume · Border radius · Opacity · Shadow · 정렬/회전/More |
| **shape: rectangle** | Fill · Stroke · Corner radii (4-corner) · Opacity · Shadow · 정렬/회전/More |
| **shape: ellipse** | Fill · Stroke · Opacity · Shadow · 정렬/회전/More |
| **shape: line** | Stroke (color/width/dash) · Opacity · 정렬/More |
| **shape: arrow** | Stroke · Arrow heads (start/end + size) · Opacity · 정렬/More |
| **shape: triangle** | Fill · Stroke · Variant · Opacity · Shadow · More |
| **shape: star** | Fill · Stroke · Points · Inner ratio · Opacity · Shadow · More |
| **shape: polygon** | Fill · Stroke · Sides · Opacity · Shadow · More |
| **shape: path** | Fill · Stroke · Opacity · Shadow · More (path d는 직접 편집 X — preset / import만) |
| **shape: speech-bubble** | Fill · Stroke · Tail position · Corner radius · Opacity · Shadow · More |
| **shape: heart** | Fill · Stroke · Variant · Opacity · Shadow · More |
| **기존 4 kinds (slide/canvas-design/block-doc/media)** | Background · Opacity · Shadow · 정렬/회전/More (1차 라운드는 minimal — 기존 동작 변경 0) |

"More" 섹션은 overflow primaries → DropdownMenu로 fallback. v1은 모든 attr이 toolbar에 직접 노출 가능하도록 widths 조정. 미달 시 More fallback.

## Decision C — Multi-selection: deferred to v2

다중 선택 시 toolbar 동작:
- **v1 (이번 라운드)**: 다중 선택이면 toolbar mount 안 함. 단일 선택만 지원.
- **v2 (별 WI)**: 공통 속성만 노출 (모든 선택 item이 공유하는 attr — 예: opacity, rotation). 상이한 값 시 indeterminate UI.

근거: multi-edit semantics는 복잡 (commit grouping, undo 단위, mixed-value 표시). v1 single-selection 만으로 핵심 가치 (item 추가 후 즉시 편집) 충족 가능.

## Decision D — Selection 감지 + Toolbar 마운트 정책

- 기존 SelectionContext (`useSelection()`) 의 `selectedFrameId`를 watch.
- selectedFrameId가 있으면 해당 item을 doc에서 lookup → kind 결정 → 매칭 editor mount.
- Drill-in 상태 (entered frame) 안에서 선택된 sub-item도 동일 로직 (단일 selection만 추적).
- Toolbar는 단순한 read+update 컴포넌트 — selection 모델 자체를 소유하지 않음.

## Decision E — Property 편집 → Patch 정책

[[feedback_doc_mutation_must_hit_history]] 의무 준수:

- Toolbar에서 속성 변경 → `editor.exec("weave.image.update", { id, patch })` 같은 weave commands 발행.
- agocraft DR-023 의 attr type을 그대로 Patch에 사용.
- Drag-style 속성 (slider 드래그 중 opacity 변경 등) 은 throttle/RAF로 한 commit 묶음 (mergeKey 자동 — agocraft).
- Color picker는 변경 종료 시점 (popover close 또는 throttle 250ms) 에 commit.

## Decision F — 신규 commands (weave.X.add / .update)

3 신규 add commands:
- `weave.image.add { containerId, frame, src, alt? }` → ImageAttrs default builder 사용
- `weave.video.add { containerId, frame, src }`
- `weave.shape.add { containerId, frame, shape, subAttrs? }`

3 신규 update commands (patch-emitting):
- `weave.image.update { id, patch: Partial<ImageAttrs> }`
- `weave.video.update { id, patch: Partial<VideoAttrs> }`
- `weave.shape.update { id, patch: Partial<ShapeAttrs> }`

기존 `weave.item.update` 와 차이: 위 신규 commands 는 type-safe Partial<XxxAttrs> 받음. 기존 `weave.item.update`는 generic patcher. 신규는 ContextualToolbar용 + type 안전성.

## 정합 — weave 기존 design decisions

- **DR-013 (peek-mode)** — peek 활성 시 ContextualToolbar는 mount 안 함 (peek가 우선). 종료 시 selection이 남아있으면 재mount.
- **DR-design-005 (editor-chrome)** — ContextualToolbar는 chrome의 일종이지만 selection-driven이라는 점에서 새 primitive 부류. DR-design-009 발행.
- **DR-018 (selection-chrome registry)** — Toolbar는 selection-driven UI지만 SelectionLayer의 핸들(8-resize 등)과는 다른 surface. Toolbar는 select 후 속성 조작, SelectionLayer는 select 후 frame manipulation. 두 surface 공존.

## Consequences

긍정:
- Canva 표준 패턴 채택으로 사용자 학습 비용 ↓.
- 단일 selection만 지원으로 v1 scope 작게.
- 새 item kind / sub-kind 추가 시 toolbar editor section만 추가 → adapter 패턴 확장 자연.
- agocraft 표준 attrs 사용으로 type-safe.

부정 / risk:
- **Toolbar 폭 management** — 12 sub-kinds × 다양한 editor section. v1은 More fallback 으로 처리.
- **Peek-mode와의 우선순위** — peek 진입 시 toolbar unmount. 사용자가 헷갈리지 않도록 transition 자연스럽게.
- **Drag-while-toolbar-visible** — frame을 drag 중 toolbar가 함께 움직이지 않게 selection 좌표 follow 정책.

## Mitigations

- Peek↔Toolbar transition: peek가 sticky 또는 hold 시작 시 toolbar fade-out 220ms. 종료 시 fade-in.
- Frame drag 중 toolbar 위치 freeze (drag 끝나면 follow).

## References

- WI-020 — `records/work-items/WI-020-item-primitives-toolbar.md`
- HANDOFF-006 — `records/decision-handoffs/HANDOFF-006-item-primitives.md`
- DR-design-009 — `records/design-reviews/DR-design-009-contextual-toolbar-primitives.md`
- agocraft DR-023 / DR-024 / WI-015 — 신규 schema source
- 관련 메모: [[feedback_doc_mutation_must_hit_history]], [[feedback_design_system_triage_mandatory]], [[feedback_radix_slot_wrapper_forwardref]]
