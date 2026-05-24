# Engineering Plan — Item primitives + ContextualToolbar (WI-020)

## Feature scope and risks

**Scope**: agocraft WI-015이 공급하는 image / video / shape schema + 4 visual specs를 weave가 consume. 5 작업:

1. `@weave/design-system`에 7 신규 primitives (DR-design-009).
2. weave에 3 신규 item kind adapter + capability 등록.
3. 3 신규 React renderer (ImageBlock / VideoBlock / ShapeBlock).
4. 6 신규 weave commands (add / update × 3 kinds).
5. ContextualToolbar — 12 editor sections (3 신규 kinds × variants + 기존 4 kinds minimal).
6. Insertion UI (Toolbar + drag-to-create).
7. e2e + baseline 회귀 보호.

**Risks** (DR-014 + WI-020에서 상세 박제):
- R1 — Toolbar 폭 overflow (More dropdown fallback)
- R2 — ColorPicker popover collision (Radix collisionPadding)
- R3 — 10 sub-kind SVG geometry (agocraft unit test + weave visual snapshot)
- R4 — Peek↔Toolbar transition (fade 220ms)
- R5 — Multi-selection 미지원 (v2 deferred, 안내 tooltip)
- R6 — Frame drag 중 Toolbar follow (freeze + recompute)
- R7 — Asset URL 보안 (host validation; image src에 화이트리스트 패턴, video도 동일)

## Architecture

### Layers

```
┌────────────────────────────────────────────────────────────────────┐
│ weave application (apps/web/)                                      │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ DesignPage                                                   │ │
│ │   ↳ <ContextualToolbar /> (selection 활성 시 mount)            │ │
│ │     ↳ <ImageEditor> | <VideoEditor> | <ShapeEditor> | ...    │ │
│ │   ↳ <FrameStage>                                             │ │
│ │     ↳ <ImageBlock> | <VideoBlock> | <ShapeBlock>             │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ apps/web/src/document/render/                                │ │
│ │   ImageBlock.tsx (uses filterToCss + paintToCss + shadowToCss) │ │
│ │   VideoBlock.tsx                                             │ │
│ │   ShapeBlock.tsx (uses shapeToSvgGeometry + paintToSvgFill)  │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ apps/web/src/document/toolbar/                               │ │
│ │   ContextualToolbar.tsx                                       │ │
│ │   editor-sections/                                           │ │
│ │     ImageEditor.tsx                                          │ │
│ │     VideoEditor.tsx                                          │ │
│ │     ShapeEditor.tsx (+ 10 sub-kind variant files)             │ │
│ │     SlideEditor.tsx / CanvasDesignEditor.tsx / ...            │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ apps/web/src/document/commands.ts                            │ │
│ │   weave.image.add / .update                                  │ │
│ │   weave.video.add / .update                                  │ │
│ │   weave.shape.add / .update                                  │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ @weave/design-system                                               │
│   ContextualToolbar.tsx                                            │
│   ColorPicker.tsx / NumberSlider.tsx / RangeSlider.tsx             │
│   SegmentedControl.tsx / IconToggleGroup.tsx / DashPatternPicker.tsx│
└────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ npm
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ agocraft (WI-015)                                                  │
│   @agocraft/core/visual    — PaintSpec, StrokeSpec, ShadowSpec,    │
│                              FilterSpec + helpers                  │
│   @agocraft/core/schema/builtin-kinds — ImageAttrs, VideoAttrs,    │
│                              ShapeAttrs + defaults + shapeToSvgGeom│
│   @agocraft/core/capability/builtin-graphics — ZOrder + Manip      │
│                              adapter builders                      │
└────────────────────────────────────────────────────────────────────┘
```

### Data flow

```
[user clicks "+" → choose "Image"]
  → DesignPage opens file picker / URL input
  → editor.exec("weave.image.add", { containerId, frame, src, alt })
  → command builds Item via defaultImageAttrs from agocraft
  → emits item.children Patch + PendingCreations stages Item
  → ChangeStream → applyChange → setDesign
  → React re-renders → FrameStage → ImageBlock mounts → <img> visible

[user selects the image]
  → SelectionContext.selectedFrameId = item.id
  → ContextualToolbar subscribes, sees kind="image"
  → ImageEditor mounts with current ImageAttrs
  → User drags opacity slider → onValueChange (transient preview)
  → On pointer-up → onValueCommit → editor.exec("weave.image.update", { id, patch: { opacity: 0.7 } })
  → command emits item.attrs Patch → applyChange → React re-render
  → mergeKey via agocraft's mergeKeyOf → 60Hz drag = 1 undo step

[user activates peek-mode]
  → peek.isActive = true
  → ContextualToolbar 전역 watcher sees peek active → fade-out
  → peek 종료 → selection 그대로면 fade-in

[user Cmd+Z]
  → editor.history.undo()
  → inverse Patch → applyChange → Item.attrs.opacity restored
```

### Boundaries

- ContextualToolbar는 selection model을 owns 안 함. SelectionContext + useEditorVM(vm.itemSelection) 만 watch.
- Editor sections는 controller가 아닌 view. Display + emit (onValueCommit → editor.exec).
- ShapeBlock의 SVG rendering은 agocraft `shapeToSvgGeometry`에 의존. weave는 직접 SVG 수학 작성 0.

## APIs / data model

### `weave.image.add` (Command)

```ts
interface AddImageInput {
  readonly containerId?: string;     // default root
  readonly frame: ItemFrame;
  readonly src: string;
  readonly alt?: string;
}
// Returns: ok(itemId, [item.children patch])
```

### `weave.image.update` (Command)

```ts
interface UpdateImageInput {
  readonly id: ItemId;
  readonly patch: Partial<ImageAttrs>;  // type-safe partial
}
// Returns: ok(undefined, [item.attrs patch])
// mergeKey: `item.attrs#${id}` (agocraft's automatic mergeKeyOf)
```

### `weave.shape.add` + `.update` — 동일 패턴, ShapeSubKind dispatch

### `weave.video.add` + `.update` — 동일

### Component contracts

```ts
interface ContextualToolbarProps {
  readonly editor: Editor;
  readonly selection: SelectionInfo | null;
}

interface ImageEditorProps {
  readonly itemId: string;
  readonly attrs: ImageAttrs;
  readonly editor: Editor;
}

// ShapeEditor dispatches to sub-kind variant
interface ShapeEditorProps {
  readonly itemId: string;
  readonly attrs: ShapeAttrs;
  readonly editor: Editor;
}
// internally: switch (attrs.shape) { case "rectangle": RectangleEditor ... }
```

### Error / edge cases

- Selection이 image/video/shape 외 kind (예: 기존 slide / block-doc / media)면 기존 minimal editor section.
- selection이 unknown kind (capability registry에 미등록)면 Toolbar mount 안 함.
- `weave.image.update` 시 itemId가 image kind가 아니면 fail("kind-mismatch", ...).
- Toolbar 폭 > viewport 시 More dropdown fallback (overflow primaries).

## Specialist reviews

| Agent | Surface | When |
|---|---|---|
| `design-system-agent` | 7 primitives token resolution + variant ceiling + Hard rule 1·2 | DR-design-009 review (Phase 1 진입 전) |
| `frontend-design-pattern-agent` | a11y / focus / popover / collision / reduced-motion | DR-design-009 review |
| `library-adoption-supply-chain-governance-agent` | `@radix-ui/react-slider` 채택 | DR-design-009 review |
| `rendering-performance-review` skill | SVG (Shape) + filter (Image) perf, backdrop-filter | Phase 3, Phase 5 |
| `web-baseline-review` skill | autoplay policy, CSP, prefers-reduced-motion | Phase 3 (Video) |
| `seo-ai-visibility-agent` | image alt 기본값, video poster, share preview | Phase 5 (Editor sections) |
| `frontend-architecture-agent` | controlled-component pattern, mergeKey 정책 | Phase 5 |

## Tests

### Unit

- `apps/web/src/document/render/__tests__/*.test.tsx` — ImageBlock / VideoBlock / ShapeBlock 의 attrs → CSS 변환 (4-6 tests each).
- `apps/web/src/document/toolbar/editor-sections/__tests__/*` — 각 editor section의 controlled-component 동작 (onValueCommit → editor.exec 확인).
- `apps/web/src/document/commands/__tests__/image-update.test.ts`, `shape-update.test.ts`, `video-update.test.ts` — patch shape 정확성 + mergeKey 일관성.
- 합계 30+ tests.

### Integration

- `apps/web/src/document/toolbar/__tests__/contextual-toolbar.integration.test.tsx` — selection mock → toolbar mount + 매칭 editor section 노출 (5+ tests).
- `apps/web/src/document/render/__tests__/render-integration.test.tsx` — DOMAIN_RENDERERS dispatch + 3 신규 kind 모두 렌더 (3+ tests).

### End-to-end

- `apps/web/e2e/item-primitives.spec.ts`:
  1. Image add via Toolbar "+" menu → DOM에 `<img>` mount + ContextualToolbar 노출.
  2. Image opacity slider drag → 시각 반영 + Cmd+Z 복귀 (1 undo step).
  3. Video add + autoplay/muted 설정 + 재생 확인.
  4. 10 sub-kind shape 추가 — 각자 SVG element 시각 확인.
  5. Shape fill color change via ColorPicker → 즉시 반영 + Cmd+Z.
  6. Peek 활성 → toolbar fade-out → peek 종료 → toolbar 복귀.
  7. Selection 변경 시 editor section 갱신.

### Security-sensitive negatives

- Image src에 javascript: URL → 허용 안 함 (host validation, command level reject).
- Video autoplay + non-muted → 브라우저 정책 차단 시 UI에서 안내.
- Shape path d에 `<script>` 또는 임의 SVG sub-element → path attribute는 string only이고 d로 들어가는 게 attr이라 XSS 위험 0.
- CSP — img-src / media-src 정책 명시 (host-level).

## Rollout / rollback

### Feature flag

- GrowthBook flag: `weave.item-primitives.enabled`. default off in production.
- Phase 7 e2e green 후 dev / staging만 on. 1주 dogfood 후 production 점진 ramp (10% → 50% → 100%).

### Ramp plan

| Stage | Target | Gate |
|---|---|---|
| Dev local | self | Phase 7 e2e |
| Staging | internal | telemetry baseline 1주 |
| Prod 10% | early adopters | toolbar latency p95 < 100ms |
| Prod 50% | broad | Cmd+Z 회귀 0 + e2e nightly green 1 주 |
| Prod 100% | all | sustained 2 주 stable |

### Kill-switch

- Flag off → ContextualToolbar mount 0 (selection 시에도). 신규 kinds add 메뉴 hidden. 기존 4 kinds 동작 그대로.
- 기존 doc에 새 kind item이 있는 경우 (이미 추가됨) → 여전히 렌더 (ImageBlock/VideoBlock/ShapeBlock가 dist에 존재).
- 완전 rollback 시 deps revert + ChangeStream replay로 새 kind item 제거 가능 (단, 실용성 낮음 — additive change라 그대로 두는 게 안전).

### Reversibility

100% additive. 기존 weave UI / 기존 editor 동작에 0 영향. 사용 안 하면 dead code (tree-shake로 dist에서 제거 가능).

## Migration plan

데이터 모델 변경 없음. 기존 4 kinds 그대로. 사용자가 새 kind 추가하는 시점에 doc에 신규 attrs.

ThumbnailPanel / PropertiesPanel migration은 본 WI 범위 외 (DR-design-008 §9 deferred).

## Estimate

| Phase | 예상 소요 | 범위 (best – worst) | 위험 요인 |
|---|---|---|---|
| Phase 0 — Contracts | 0.3 일 | 0.2 – 0.5 일 | DR-014 + DR-design-009 review iteration |
| Phase 1 — DS growth (7 primitives) | 3 일 | 2 – 5 일 | Radix Slider sign-off + ColorPicker UX + 3 theme visual diff |
| Phase 2 — Adapter wiring | 0.5 일 | 0.3 – 1 일 | agocraft Patch / schema 학습 |
| Phase 3 — Rendering (3 blocks) | 1.5 일 | 1 – 3 일 | SVG geometry edge cases (R3), video autoplay (R7) |
| Phase 4 — Commands | 0.5 일 | 0.3 – 1 일 | PendingCreations 신규 kind 통합 |
| Phase 5 — Toolbar integration (12 sections) | 3 일 | 2 – 5 일 | Toolbar 폭 / popover collision / peek transition |
| Phase 6 — Insertion UI | 1 일 | 0.5 – 2 일 | RubberBand drag-flow 통합 (Insertable capability 확장) |
| Phase 7 — e2e + verify | 1.5 일 | 1 – 3 일 | 7 시나리오 + baseline maintain |
| **합계** | **11.3 일** | **7.3 – 20.5 일** | agocraft WI-015 publish 지연 시 Phase 2 blocked |

agocraft WI-015와 동기 진행 시 Phase 0~1은 병렬 가능 → 전체 ~10 영업일 (~2주). buffer 포함 2주 SLA에 맞춤.

## References

- WI-020 — `records/work-items/WI-020-item-primitives-toolbar.md`
- DR-014 — `records/decisions/DR-014-contextual-toolbar.md`
- DR-design-009 — `records/design-reviews/DR-design-009-contextual-toolbar-primitives.md`
- HANDOFF-006 — `records/decision-handoffs/HANDOFF-006-item-primitives.md`
- agocraft WI-015 — `workspace/agocraft/records/work-items/WI-015-item-primitives.md`
- agocraft DR-023 / DR-024 — schema source
- DR-014 (peek-mode adapter) — Toolbar vs peek conflict resolution
