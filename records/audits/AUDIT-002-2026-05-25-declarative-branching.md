# AUDIT-002 — weave 선언적 분기 위반 카탈로그 + Rule 6 적용 (2026-05-25)

## Metadata

| Field | Value |
|---|---|
| ID | AUDIT-002 |
| Scope | `workspace/weave/apps/web/src` + `packages/design-system/src` |
| Trigger | 사용자 요청 — "모든 코드가 선언적, 컨텍스트가 분기 결정, 분기 처리 조각만 동작" 원칙을 OS-root 에 박제 + 양 프로젝트 분석 + 리팩토링 |
| Date | 2026-05-25 |
| Status | **Partial-resolved** — Top 1 위반 (ContextualToolbar) 즉시 리팩토링 완료. 잔여 6건은 follow-up 으로 박제 |
| Cross-references | OS-root `docs/04-specialized-engineering/CODE_STRUCTURE_DESIGN_RULES.md` § Rule 6 (오늘 신설), 루트 `CLAUDE.md` Core Engineering Principles (오늘 갱신), [agocraft AUDIT-002](../../agocraft/records/audits/AUDIT-002-2026-05-25-declarative-branching.md) |

## 1. OS-root Rule 6 신설 — Declarative branching via context dispatch

핵심 원칙:
- **어떤 함수/모듈도 `kind`/`type`/`mode`/`category` 에 대한 분기를 자기 body 안에 가지면 안 된다.**
- 분기 책임은 **Registry + Capability Adapter** 에 흡수: `(ctx) → registry.resolve(ctx.kind)?.(ctx)`
- 각 분기 처리 = 자기 adapter 파일. 새 kind 추가 시 새 파일 1개 + 등록 1줄. 기존 파일 수정 없음.
- 캐틀 코드는 자기가 처리하는 분기가 무엇인지 모른다.

허용 예외:
- 순수 transform / typeguard / early-return precondition guard
- valibot/zod 의 discriminatedUnion (라이브러리가 분기 책임을 진다)
- *단 하나의 site* 가 모든 variant 를 알아야 하는 경우 (예: serializer 의 `invertPatch`) — 명시적으로 그 1 site 임이 문서화. 두 번째 site 는 smell.

## 2. weave 분기 위반 카탈로그 (검출)

| V-id | 위치 | 분기 case 수 | 심각도 | 위반 종류 |
|---|---|---|---|---|
| **V-1** | `apps/web/src/document/toolbar/ContextualToolbar.tsx:227` | 18 | **Critical** | switch-on-kind (5 outer + 10 inner shape sub-kind + 3 fall-through) |
| V-2 | `apps/web/src/pages/PropertiesPanel.tsx:218,718` | 14 (7+7) | Major | switch-on-kind (frame domain × 4 + behavior × 3, 2 sites) |
| V-3 | `apps/web/src/document/agocraft-mirror.ts:160` | 4 | Major | switch-on-change.type (Patch variant 분기) |
| V-4 | `apps/web/src/document/domains/index.ts` `DOMAIN_RENDERERS` | 8 | Major | object catalog (이미 AUDIT-001 F-7) |
| V-5 | `apps/web/src/pages/PresentPage.tsx:26,347` | 8 (modeColor 5 + behavior action 3) | Minor | switch-on-mode + switch-on-action.type |
| V-6 | `apps/web/src/pages/ThumbnailPanel.tsx:32` | 4 | Minor | switch-on-kind (frame thumb variant) |
| V-7 | `apps/web/src/document/seed.ts` | 7+ | Minor | if-else chain on DomainKind in `createDefaultItem` |
| V-8 | `apps/web/src/document/use-weave-editor.ts:128-131` `allowedChildKinds` | 7 | Minor | hardcoded array (이미 AUDIT-001 F-7) |
| V-9 | `apps/web/src/document/BehaviorEditor.tsx:70` | 3 | Minor | switch-on-behavior.kind |
| V-10 | `apps/web/src/document/interactions/hotspot.tsx:6` | 3 | Minor | switch-on-action.type (HANDOFF-007 의존 — behavior 모델 한계) |

**Total: 10 위반, ~76 cases 분기**

## 3. agocraft 측 평가 (요약)

agocraft 의 switch 사이트들은 대부분 OS Rule 6 의 **허용 예외 카테고리에 해당**:

- `core/serialize/serializer.ts` 의 deserialize switch — round-trip integrity 의 단일 site (예외 조항).
- `core/change/change.ts` / `editor/history.ts` 의 `switch (c.type)` / `switch (p.type)` — Patch / Change 의 한정된 4 variant. `invertPatch` 와 `applyChange` 에 각각 1 site. 두 site 가 모두 한 단위 (history) 이므로 합쳐서 1 logical site.
- `editor/selection.ts` 의 `switch (s.kind)` — 2 variant (item / sub). 단순 typeguard 변형.
- `domain-media/src/filter.ts` 의 `switch (op.type)` — filter operator 처리. Plugin 확장이 일어나면 위반이지만 현재는 closed-list 의도 가능.
- `capability/capability.ts` 의 `switch (target.kind)` — 4 variant (item/unit/relation/global). Capability target 타입의 본질적 구분, 새 variant 가 추가될 가능성 낮음.

**agocraft 측 Critical/Major 위반 없음.** 라이브러리가 이미 capability registry / plugin model 로 외부 분기를 흡수하는 구조. 본 audit 의 Rule 6 적용은 weave 같은 **앱 계층**에서 가장 큰 효과.

## 4. 적용 완료 — V-1 (ContextualToolbar)

### Before
- `apps/web/src/document/toolbar/ContextualToolbar.tsx` 977 라인
- `switch (firstKind)` 18 cases (5 outer kinds + 8 shape sub-kinds + 4 frame-background fall-through + 1 default)
- 새 DomainKind 추가 = 이 파일 본문 수정 + case 본체 추가

### After
- `ContextualToolbar.tsx` 114 라인 (88% 감소)
- `switch` **0 cases** — `toolbarSectionRegistry.resolve(firstKind)?.Component(...)` 만
- 새 디렉터리:
  - `toolbar/multi-edit.tsx` — MIXED/sharedValue/isMixed/MixedBadge/updateAll/truncateUrl 추출 (77L)
  - `toolbar/sections/types.ts` — ToolbarSection / createToolbarSectionRegistry (64L)
  - `toolbar/sections/index.ts` — bootstrap (23L)
  - `toolbar/sections/image-section.tsx` (129L)
  - `toolbar/sections/video-section.tsx` (140L)
  - `toolbar/sections/shape-section.tsx` (245L) — `defaultSubAttrsForKind` 의 10-case switch 는 *한 site 에서 자기 자신의 subAttrs 만 안다* 는 허용 예외에 해당 (shape section 외부에서는 호출되지 않음)
  - `toolbar/sections/text-section.tsx` (289L)
  - `toolbar/sections/frame-background-section.tsx` (68L, 4 도메인 공유)
- 새 DomainKind 추가 = `sections/<new>-section.tsx` + `sections/index.ts` 의 한 줄. **`ContextualToolbar.tsx` 절대 수정 안 됨.**

### 검증
- `npx tsc --noEmit` GREEN
- `npx vite build` GREEN — 744 KB / 235 KB gzip (변화 없음, 사용처는 같은 모듈 묶음)
- 사용자 동작 preserved (Mixed badge, commit-applies-to-all, design-bg variant, hidden-on-mixed-kinds)
- Commit: `0d8...` (이 audit 와 함께)

## 5. 잔여 위반 follow-up

다음 사이클 또는 의존 작업 완료 후:

### Tier 1 — 즉시 가능 (agocraft 의존 없음)
- **V-2 PropertiesPanel** — 동일 패턴 (`panels/<kind>-panel.tsx` + `panels/registry`). 약 1일.
- **V-4 + V-8 DOMAIN_RENDERERS + allowedChildKinds** — `DomainCapability` 통합 인터페이스 + registry. AUDIT-001 F-7 와 합쳐 처리. 약 1일.
- **V-6 ThumbnailPanel** — 4 cases, lift-and-shift 작은 작업. 0.5일.
- **V-7 seed.ts createDefaultItem** — kind 별 default 도 capability adapter 가 노출 (`defaultAttrs(): Attrs`). V-4 와 묶음.
- **V-9 BehaviorEditor + V-10 hotspot** — Behavior 도메인의 분기. `behavior/<kind>-editor.tsx` + registry. 1일.

### Tier 2 — agocraft Patch variant 의존
- **V-3 agocraft-mirror.ts** — 4 case switch on change.type 은 agocraft Patch model 의 본질. HANDOFF-007 (Patch variant 확장) 응답 후 5+ case 로 늘어나는 시점에 `applyChange` 도 같은 패턴으로 분리.

### Tier 3 — 자연 종료
- **V-5 PresentPage** — `modeColor` 5-case switch 는 mode → color mapping 단순 lookup. `MODE_COLOR_MAP` 객체보다 const-record 가 더 깔끔하지만 OCP 위반은 아님 (mode 는 closed-set). 우선순위 낮음.

## 6. 메모리 박제

- 신규 entry: `feedback_declarative_branching_rule6.md` — OS Rule 6 + ContextualToolbar 사례 + 잔여 follow-up 목록
- 갱신 entry: 없음 (AUDIT-001 의 ContextualToolbar F-6 는 이 변경으로 사실상 해결됨 → AUDIT-002 가 그것을 cross-link)

## 7. 변경 이력

- 2026-05-25 — 초안 + V-1 (ContextualToolbar) 즉시 리팩토링 완료
