# FR-005 — Frame-only paradigm (4 domains → single `frame` kind)

## Metadata

| Field | Value |
|---|---|
| ID | FR-005 |
| Title | weave 의 4 도메인 kind (slide/canvas-design/block-doc/media) 를 단일 `frame` kind 로 통합하는 paradigm shift 의 기술적 실현 가능성 |
| Author | claude (technical-feasibility-agent role) |
| Status | Draft |
| Created | 2026-05-25 |
| Related WI | WI-032 |
| Related spec | `docs/product/FRAME_ONLY_PARADIGM_SPEC.md` |

## Verdict

**FEASIBLE WITH TRADE-OFFS** (스코프 큼 — 2 주 일정 조심).

전체 변환은 기술적으로 가능하며 마이그레이션 무손실로 풀이됨. 다만 (a) 코드 footprint 가 큼 (37 코드 + 29 e2e = 66 파일), (b) 의존 작업이 다수 (WI-028 sync · WI-029 text · WI-030 preset · WI-031 corner radius), (c) v1 launch T-0 까지 2 주 일정이 빠듯해 일부 deferred scope 가 필요할 가능성. 채택 시 두 가지 의도적 trade-off (Inline 편집 UX 일시 후퇴 · 4 flavor 광고 1 로 축소).

## Boundaries explored

### F1 — 4 도메인 kind 의 코드 footprint

**답: 측정됨. 37 코드 파일 + 29 e2e 파일, 합 66 파일.**

근거:
- `grep -rl '"slide"|"canvas-design"|"block-doc"|"media"' apps/web/src` → 37 파일.
- `grep -rl 'slide|canvas-design|block-doc|media' apps/web/e2e` → 29 파일.
- 가장 큰 dependent:
  - `zorder/reorder-root-children.test.ts` — 15 회 `"slide"` 사용.
  - `types.ts` — 32 회 합산 (DomainKind union, ItemAttrsByKind, FLAVOR_REGISTRY).
  - `insertable/design-root.insertable.ts` — 15 회 (각 도메인의 추천 항목).
  - `domains/index.ts` — DOMAIN_RENDERERS 의 4 entry.
- `apps/web/src/document/sync/` 는 영향 없음 (kind-agnostic).
- `storage.ts` 는 schema migrations + canvas-design 의 데이터 정규화 로직 일부 의존 (line 120, 133, 171, 190, 496-499).

**구현 견적**:
- 파일 변경: 약 40-50 파일 (코드 + e2e).
- 새 파일: `migrate-frame-only.ts`, `FrameBlock.tsx`, `frame-only-migration.spec.ts`.
- 삭제: `SlideBlock.tsx`, `CanvasBlock.tsx`, `DocBlock.tsx`, `MediaBlock.tsx`.

### F2 — 자동 마이그레이션 무손실 가능성

**답: 가능. 4 도메인 모두 시각 보존 변환 정의 가능.**

근거:
- **slide → frame** (FRAME_ONLY_PARADIGM_SPEC §3.1): title + bullets 를 frame 의 child text 들로 분리. 좌표는 슬라이드 내부의 기존 패딩 (6/8 의 Tailwind p-6 md:p-8) 을 0..1 ratio 로 환산.
- **canvas-design → frame** (§3.2): `attrs.shapes[]` 의 각 entry 를 일반 shape primitive 로 1:1 변환. `summary` 는 frame 하단 텍스트.
- **block-doc → frame** (§3.3): heading + paragraphs 를 두 text primitive 로.
- **media → frame** (§3.4): caption + tone 을 image/video placeholder + caption text 로.
- 모든 경우 frame.frame (위치+크기+회전) 보존, 시각 footprint 동일.

**검증 전략**:
- Unit test — `migrateLegacyKindsToFrame(legacyDoc).root` 의 deep equality 비교.
- Visual regression — 마이그레이션 전/후 same screenshot 비교 e2e (`frame-only-migration.spec.ts`).

**미세 trade-off (의도적)**:
- slide 의 EditableText (title 인라인 클릭→편집) → 일반 text primitive 의 Lexical 편집 (double-click 진입). UX 동일 의도, 인터랙션 약간 다름.
- canvas-design 의 shape array 안의 도형 = 일반 shape primitive 와 합쳐짐. 사용자가 본질적으로 차이를 못 느끼나, 내부 데이터 path 단일화.

### F3 — Sync (WI-028) 호환

**답: 가능. Y.Doc 의 동일 마이그레이션 적용.**

근거:
- `apps/web/src/document/sync/` 는 kind-agnostic (검증: grep 0 hit).
- `agocraft-mirror.ts` 의 `applyPatchToYDoc` / `seedYDocFromDocument` / `deriveDocumentFromYDoc` 은 kind 를 string 으로 다룸 (agocraft 의 ItemKind = string 기반).
- 따라서 Y.Doc 의 entry 가 `kind: "slide"` 로 저장돼 있어도, 첫 로드 시 weave-local `migrateLegacyKindsToFrame` 이 변환 → `seedYDocFromDocument` 가 frame kind 로 다시 Y.Doc 에 쓴다. 한 번의 라운드트립으로 정착.
- sync 가 paused (SYNC_ENABLED=false) 상태이므로 이 변환은 cloud 와 충돌 없음.

### F4 — 2 주 일정 현실성

**답: 빠듯. 일부 deferred scope 권장.**

근거 (FRAME_ONLY_PARADIGM_SPEC §6 의 14 일 plan 분석):
- **D1-D2 Phase 1** (kind 정의 + FrameBlock + types) — 현실적. 작은 작업.
- **D3-D4 Phase 2** (마이그레이션 helper + 단위 테스트) — 현실적. 4 변환 함수 + 4 unit test.
- **D5-D6 Phase 3** (4 *Block 제거 + 의존 코드 cleanup) — **위험**. 60+ 회 occurrence 정리 + e2e 재작성. 3 일로 늘릴 가능성.
- **D7-D8 Phase 4** (WI-030 preset 적용) — 현실적. 작은 변경.
- **D9-D10 Phase 5** (Flavor 축소) — **deferrable**. v1 launch 후 진행 가능.
- **D11-D12 Phase 6** (e2e 갱신 + visual regression) — **위험**. 29 e2e 파일.
- **D13-D14 Phase 7** (LG-001 재평가) — 필수.

**Scope-reduction 옵션**:
- **R1**: Flavor 축소 (Phase 5) 를 v1.x 로 미룸. v1 은 4 flavor wizard 그대로 노출, 내부적으론 4 flavor 모두 frame paradigm 의 첫 frame 으로 매핑.
- **R2**: 29 e2e 의 단계적 갱신 — slide 관련 e2e 만 v1 launch 전 갱신, canvas/doc/media 관련 e2e 는 v1.x.
- **R3**: 마이그레이션 helper 는 v1 에 포함, 새 frame kind 의 사용자-노출 entry 는 wizard 의 새 옵션으로 작게 (큰 변화 없는 surface).

R1+R2 채택 시 일정 13 일 → 10 일로 압축 가능. v1 launch 마진 ≈ 3 일.

### F5 — WI-029 / WI-030 / WI-031 의 영향

**답: 의존 있음. 차례로 정리 필요.**

근거:
- **WI-029 (text v1)**:
  - Phase 1.5 schema (textAlignHorizontal/lineHeightSpec/textRuns) 모두 frame paradigm 과 정렬. 영향 0.
  - R5 UI (banner + tooltip + onboarding) 는 frame kind 와 직교. 영향 0.
- **WI-030 (preset)**:
  - Phase 1 의 cover.{bold/hero/asymmetric} preset 의 root kind 가 `"slide"` → `"frame"` 로 변경. 코드 한 줄 (buildSlideRoot → buildFrameRoot) + Phase 1 fix 의 SlideBlock placeholder 가드 제거. **재작업 작음**.
  - Phase 2-8 (나머지 7 카테고리) 는 frame paradigm 으로 작성하면 됨. 영향 0 (Phase 1 머지 직후).
  - Phase 9 (visual regression) 의 screenshot 은 다시 잡아야 함.
- **WI-031 (corner radius)**:
  - frame kind 에도 cornerRadius attrs 존재. ManipulationCapability 의 propertyDrag 가 frame + image + shape 에 동일 적용. **재작업 0** (오히려 더 깔끔).

### F6 — Selection chrome / FrameStage 정리

**답: 가능. `isDomainItem` 의 한 곳에 frame 추가, 4 도메인 제거.**

근거:
- `apps/web/src/document/agocraft-mirror.ts:565` 의 `isDomainItem` 이 단일 lookup 사이트. `k === "frame" || k === "image" || k === "video" || k === "shape" || k === "text"` 로 정리.
- `FrameStage.tsx` 의 `childFrames = item.children.filter(isDomainItem)` 는 결과 동일.
- `selection-chrome/frame-default-view-model.tsx` 는 kind-agnostic.

### F7 — `weave.shape.update` / `weave.shape.remove` 명령 제거의 영향

**답: 안전. 대체 경로 = 일반 `weave.item.update`.**

근거:
- 이 두 명령은 canvas-design 의 `attrs.shapes[]` 배열의 개별 도형 편집용. canvas-design 이 사라지면 의미 없음.
- 일반 shape primitive 는 `weave.item.update` 로 자기 attrs (shape, fill, stroke 등) 갱신.
- `commands.ts` / `commands.test.ts` / 의존하는 ContextualToolbar canvas-section 정리.

## Trade-offs (의도적)

1. **Inline 편집 UX 일시 후퇴** — slide 의 `EditableText` 가 사라지고 일반 text primitive 의 Lexical 편집으로. double-click 진입이 single-click 보다 한 단계 추가. 향후 frame primitive 에 "label" 인라인 편집을 추가하면 회복 가능 (v1.x).
2. **4 flavor 광고 1 로 축소** — LandingPage / NewDesignWizard 의 4 flavor 타일 → 1. 마케팅 surface 갱신 필요. v2 의 data-driven flavor 로 복원 가능.
3. **schema bump v9 → v10** — 자동 마이그레이션 후엔 사용자가 인지 못함. 단 backup 로 v9 형태 보존 1주 보관 권장 (RISK-004 의 mitigation).

## Open dependencies

- agocraft 의 ItemKind 는 `string` 기반 — agocraft 패키지 변경 0. weave-local 변화.
- Y.Doc schema 변환 — sync paused 상태라 cloud 충돌 없음.
- LG-001 의 conditional 항목 재평가 — Phase 7 의 의무.

## Scope-reduction options (recommended)

R1 (Flavor 축소를 v1.x 로) + R2 (e2e 의 단계적 갱신) 채택 권장. v1 = "frame kind 도입 + 마이그레이션 + 핵심 e2e 정리", v1.x = "wizard / 4 flavor / 잔여 e2e cleanup".

## Decision

**FR-005 verdict = FEASIBLE WITH TRADE-OFFS**. 2 주 일정 + 사용자 결정 (full domain removal) 그대로 진행 가능, R1+R2 의 scope reduction 권장. RISK-004 후 Engineering Plan 으로.

Accepted trade-offs:
- T1: Inline 편집 UX 일시 후퇴 (Lexical 편집으로 흡수).
- T2: 4 flavor 광고 1 으로 단순화 (v1) → v2 data-driven 복원.
- T3: Schema bump v9 → v10 + 1 주 v9 backup 보관.
