# AUDIT-001 — weave 구조 정밀 감사 (2026-05-25)

## Metadata

| Field | Value |
|---|---|
| ID | AUDIT-001 |
| Scope | `workspace/weave/` — apps/web/src + apps/web/api + packages/design-system + apps/web/vendor/agocraft |
| Auditor | claude (general-purpose subagent), 단일 세션 정밀 검토 |
| Date | 2026-05-25 |
| Trigger | 사용자 요청 — SOLID/GRASP + agocraft 사용 패턴 + UI/UX 유지보수성 + 회귀 패턴 가드 정밀 검토 |
| Status | **Active** — Tier 0 (Critical 3건) 후속 작업 시급. WI 발행 대기 |
| Cross-references | [AUDIT-001 agocraft](../../agocraft/records/audits/AUDIT-001-2026-05-25-structural-review.md), [HANDOFF-007/008/009 (agocraft 인박스)](../../agocraft/records/decision-handoffs/) |

## 1. 종합 평가

- **전체 점수: B+** — 도메인 모델·History 파이프라인·Design System triage 가 합리적으로 일관, 빌드/타입체크 그린, `any`/`@ts-ignore` 0건, strict 옵션 풀 활성. 다만 거대 컴포넌트 3종의 응집도 하락 + API hardening 부재가 발목.
- **배포 준비도: RC** (limited beta) — 실제 사용 시나리오 동작 + 회귀 가드 e2e 34 spec, 그러나 multi-tenant 부재 / payload 한도 부재 / `__weaveVm` 글로벌 / `disposeState()` 없는 의도 cleanup 회피 등 production hardening 항목 남음.

### 가장 큰 강점 3개
- **Document mutation rule 이 코드 레벨에서 강제됨**: `editor.exec` 22회 호출 vs `setAgoDoc` 직접 호출 **0건**. `applyChangeToDocument` 가 단일 reducer, `PendingCreations` side-channel 까지 박제.
- TypeScript strict 풀 활성 + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 가 `tsconfig.base.json` 박제. 91개의 `as unknown` 캐스트는 거의 전부 agocraft schema↔weave attrs contract boundary 에 국한.
- 회귀 박제 패턴 6개 중 5개가 코드에 명시 코멘트로 가드 (backdrop-filter, StrictMode dispose, Radix slot forwardRef, HTMLAttributes title 충돌, portal event guard).

### 가장 큰 위험 3개
- **거대 컴포넌트의 응집도 붕괴 가능성**: `FrameStage.tsx` 1942L, `DesignPage.tsx` 1203L, `ContextualToolbar.tsx` 977L. Phase 한두 번이면 임계점.
- **multi-tenant 부재 + payload 한도 없음**: cookie 기반 device-id 단독 스코핑, cookie 도용 = 즉시 다른 사람 디자인 노출. `kv.set` size 검증 0, `req.body` 길이 가드 0, Vercel KV 1MB 한도까지 silent 누적.
- **`window.__weaveVm` 사이드채널이 hot-path 침투**: 7곳에서 global 통해 vm 읽기/쓰기. dev/e2e 진단 명분이지만 production hot-path (`useInteractionMode`, `useSelection`) 가 같은 경로 → SSR/multi-window/iframe 시 즉시 깨짐.

## 2. SOLID/GRASP 평가 (모듈별)

| 모듈 | SRP | OCP | LSP | ISP | DIP | 결합도 | 응집도 | 비고 |
|---|---|---|---|---|---|---|---|---|
| `document/commands.ts` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | 7개 명령, patch-emitting/direct 명확히 구분 |
| `document/agocraft-mirror.ts` | ✓ | △ | ✓ | △ | ✓ | 중 | 높음 | 554L. `applyChangeToDocument` switch 4-case 가 OCP 한계 |
| `document/use-design.ts` | △ | ✓ | ✓ | ✓ | ✓ | 중 | 높음 | 12 callback facade, escape-hatch 4개 (`setPresentationOrder`/`addBehavior`/`setDesignBackground`/`reorderRootChildrenCb`) 가 editor.exec 우회 |
| `document/use-weave-editor.ts` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | 282L, ref-mediated stable closure 정석 |
| `document/domains/*` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | `DOMAIN_RENDERERS` 정적 카탈로그가 OCP 약점 |
| `document/interactions/*` | △ | ✓ | ✓ | △ | △ | 중 | 중 | `window.__weaveVm` 글로벌이 DIP 위반 |
| `document/toolbar/ContextualToolbar.tsx` | ✗ | △ | ✓ | △ | ✓ | 중 | 낮음 | 977L 단일 switch — kind당 1 컴포넌트 분리 필요 |
| `document/render/*` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | FrameContent/PresentFrameTree 깔끔 |
| `document/rubber-band/*` | △ | ✓ | ✓ | △ | ✓ | 중 | 중 | `RubberBandLayer.tsx` 803L |
| `document/marquee/*` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | 단일 책임, `swallow click` 박제 |
| `document/selection-chrome/*` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | DR-018 view-model registry 정석 |
| `document/zorder/*` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | adapter 패턴, Patch 한계 코멘트 박제 |
| `pages/FrameStage.tsx` | ✗ | △ | ✓ | △ | ✓ | 높음 | 중 | 1942L — NestedFrame 인라인, 책임 7+ |
| `pages/DesignPage.tsx` | ✗ | ✓ | ✓ | △ | ✓ | 높음 | 중 | 1203L — body 단일 함수에 11+ 책임 |
| `packages/design-system/*` | ✓ | ✓ | ✓ | ✓ | ✓ | 낮음 | 높음 | 31 컴포넌트, forwardRef + `Omit<…, "title">` 가드 + 토큰만 사용 |
| `apps/web/api/*` | △ | ✓ | ✓ | ✓ | △ | 중 | 중 | KV 추상화 적절. 입력검증/payload limit/rate-limit/인증 모두 부재 |

## 3. agocraft 사용 패턴 (가장 중요)

**Document mutation rule 위반 grep 결과**:
- `setAgoDoc` 직접 호출: **0건** (코멘트 인용 1건 only — `agocraft-mirror.ts:129`)
- `setDesign(` 13건 모두 `use-design.ts` 내부 (84~225L) — 의도된 reducer
- `targetsRef.current` 4건 모두 `use-weave-editor.ts:209-223` proxy 정의 — 의도된 indirection
- `editor.exec("weave.*")` 22건, 정상 위치 (commands.ts / use-weave-editor / DesignPage / FrameStage / insertable / toolbar / slide-bullet-handle)

→ **위반 0건**. mutation rule 이 코드 레벨에서 실제로 지켜진다.

**editor.exec ↔ Patch ↔ ChangeStream ↔ History 흐름**:
- 7개 명령 중 5개가 real `Patch` emit. `item.attrs` / `unit.attrs` / `item.children` 3종.
- `weave.item.add` 가 `PendingCreations` side-channel 로 새 Item stage + `item.children` Patch 의 `added: [id]` 만 실어 보내는 WI-013 Phase 5 패턴 정확 구현.
- `applyChangeToDocument` 단일 reducer. subscriber 가 `origins: ["user-command", "system"]` 필터 — propagation/RelationEngine echo 제외.
- DR-017 ADR-D drag auto-merge: `historyMergeWindowMs: 500` `createEditor` 옵션 박제. 60Hz drag same-target collapse.

**escape-hatch 4개** (직접 `setDesign`, undo 불가):
1. `setPresentationOrder`
2. `addBehavior`
3. `setDesignBackground`
4. `reorderRootChildrenCb` (`design-frame.zorder.ts:36-46` 에 박제 코멘트)

→ 모두 agocraft Patch variant 한계. **HANDOFF-007 (Patch variant expansion)** 발행 후 흡수 예정.

**OCP — 새 도메인 추가 시 강제 수정 지점 (5~6곳)**:
1. `apps/web/src/document/types.ts` — `DomainKind` union + `DOMAIN_REGISTRY` + `ItemAttrsByKind`
2. `apps/web/src/document/seed.ts` — `createDefaultItem`
3. `apps/web/src/document/domains/index.ts` — `DOMAIN_RENDERERS`
4. `apps/web/src/document/use-weave-editor.ts:128-131` — `allowedChildKinds`
5. `apps/web/src/document/toolbar/ContextualToolbar.tsx:227` — 단일 switch
6. `apps/web/src/document/storage.ts` — migration

→ 도메인 4→8 확장된 WI-020/Phase 15 에서 이미 분산수정 비용 박힘.

## 4. UI 컴포넌트 복잡도

- `FrameStage.tsx` 1942L — `NestedFrame` (281~810L) + drill 보간 + ResizeObserver + marquee/rubber-band/handle/drag 라우팅 + manipulation binding 구성. 책임 7+.
- `DesignPage.tsx` 1203L — body 단일 함수에 11+ 책임 (cloud bootstrap, facade, vm/editor/router/selectionChrome wiring, peek drag, screenToDesign, addNewItem closure, hotspot region edit, MediaSrcDialog state, ContextMenu wrapper, fitTo).
- `ContextualToolbar.tsx` 977L — image/video/shape/text/slide4 5 case + shape sub-kind 12 case 한 파일.
- `RubberBandLayer.tsx` 803L — Popover orchestration + visual + capability adapt.

**디자인시스템 외부 lookalike**:
- 도드라지는 인라인 lookalike 없음 (Card/Panel/Button/Dialog 모두 design-system 경유) ✓
- 토큰 외 인라인 색: `seed.ts:170,187` 시드 (user-data, OK), `ContextualToolbar.tsx:456-882` ColorPicker fallback 색 (`#000000`, `#cccccc`, `#ffffff` — 토큰화 가능), `LandingPage.tsx:172-174` `#ffffff` 비교 + `#1f2933` (썸네일 대비 처리)

## 5. 회귀 패턴 가드

| 패턴 | 코드 상태 | e2e 가드 | 근거 |
|---|---|---|---|
| React StrictMode + 싱글톤 dispose 금지 | **있음** | 간접 | `use-weave-editor.ts:185-188` "Intentionally no disposeState() cleanup" 코멘트; `use-peek-mode.ts:188-190` 동일 |
| Radix asChild wrapper forwardRef + rest | **있음** | `tooltip-kind-polymorphism.spec.ts`, `ai-tooltip.spec.ts` | `AITooltip.tsx:703-740` 의 `forwardRef` + `mergeRefs` + `{...rest}`. 31개 DS 컴포넌트 모두 |
| React portal event component-tree bubble | **부분** | `multi-marquee-flow.spec.ts`, `repeat-add.spec.ts` | `MarqueeSelectionLayer.tsx:175,220-227` swallow click + `stopPropagation`. `e.target === e.currentTarget` guard 는 grep 미검출 |
| cubic-bezier P2.X 대칭 | **혼재** | 없음 | `--motion-spring-fast` symmetric ✓ / `--motion-spring-soft` asymmetric / `--motion-ease (0.4, 0, 0.2, 1)` Material standard 가 `PeekOverlay.tsx:58,71-73` crossfade 에 사용 |
| HTMLAttributes prop name 충돌 | **있음** | 없음 | `RadioTile.tsx:35` `extends Omit<…, "title">` 정확 적용 |
| backdrop-filter under transform | **있음** | 없음 | `Panel.tsx:39-42`, `ContextualToolbar.tsx:17-20`, `Stage.tsx:276-284`, `PointStackInspector.tsx:194-199` 모두 `translateZ(0)` + `will-change: backdrop-filter` + `isolation: isolate` |

## 6. Cloud Sync / API 레이어

- `storage.ts` (514L) — v1→v5 5단계 migration, `deepNormalizeItem` recursive. `onUnknown: "preserve"` 가 `serializer.fromJSON` 옵션 박제 ✓
- `resource-storage.ts` (132L) — MediaResource CRUD, `sessionOnly` blob: URL 마크업 + 비동기 cloud mirror
- `cloud-sync.ts` (190L) — fire-and-forget mirror + bootstrap. `cloudAvailable` 캐싱이 first-write-fail 후 silent 차단 → 디버깅 어려움
- API 라우트:
  - 입력 검증: `id` string check 정도. `body` 전체 검증 0
  - payload 크기: **검증 없음**. Vercel Node 4.5MB body limit 에 기댐
  - Content-Type: implicit JSON. 강제 부재
  - 인증: cookie 기반 device-id. cookie 도용 = 즉시 takeover
  - 에러 코드: stable code 부재 (agocraft F-2 영향)

**multi-tenant 한계**: `deviceScope(did)` KV key prefix. cross-device sync 0 / 공유 0 / 권한 0. **DEPLOY.md / 코멘트 어디에도 명시 박제 없음** — 운영자 실수 위험.

**KV env 추상화**: `_lib/kv.ts` 가 legacy + Upstash Marketplace 둘 다 지원 ✓. 단 `memoryClient` shim 이 production env 누락 시 silent 동작 — 사용자는 "저장됨" 으로 봄, cold-start 마다 소실.

## 7. TypeScript / 런타임 안전성

- `tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `isolatedModules: true`. 풀 활성 ✓
- `: any` 명시: **0건**
- `@ts-ignore` / `@ts-expect-error`: **0건**
- `as unknown` 캐스트: 91건 — 거의 전부 `attrs as unknown as XAttrs` (agocraft generic ↔ weave typed boundary). narrow type guard 함수로 흡수 가능.
- `typecheck` PASS 확인 실측.

## 8. 디자인 시스템 평가

- 31 컴포넌트. named export, forwardRef 광범위, `sideEffects: ["**/*.css"]` 명시. Rule 2 통과.
- exports `.` + 3 CSS subpath — Rule 2 의 "no mega-object default" 통과.
- 토큰: 3-tier (base / semantic / theme), 활용 빈도 253회. 인라인 hex 0건 in design-system.
- variant explosion 없음.
- Radix wrapping forwardRef (메모 박제): **준수**. `AITooltip.tsx:689-702` 명시 코멘트 박제.
- HTMLAttributes title 충돌 (메모 박제): `RadioTile.tsx:35` `Omit<…, "title">` 정확 적용.
- Triage 박제: `records/design-reviews/DR-design-001~009` 9건. WI-020 ContextualToolbar 가 DR-design-009 와 짝지어 발행.
- 비대 컴포넌트: `AITooltip.tsx` 815L — hook + provider + wrapper + dataset + portal positioning. 다음 phase 분리 권장.

## 9. 테스트 커버리지

- e2e specs **34개**, 총 4757L
- Undo/Redo e2e (메모 박제 `history-*.spec.ts`): 3 spec, `ControlOrMeta+z` 14회 — `weave.item.update`, `weave.item.add`/`remove`, `weave.shape.update` 커버. **4개 escape-hatch (`setPresentationOrder`/`addBehavior`/`setDesignBackground`/`reorderRootChildrenCb`) 의 undo 동작은 spec 없음**.
- 회귀 가드 e2e: Radix slot 3 spec / portal bubble 2 spec / context menu drilling 2 spec.
- 빌드 / typecheck GREEN 실측.

## 10. Vercel 배포 / 운영 준비도

- `vendor/agocraft/` 16 tarball 동일 timestamp ✓. **재빌드 시 git tracked 확인 필요** — `.gitignore` 미확인. ignored 면 fresh clone → install fail.
- `vercel.json` 적절. Functions zero-config dispatch.
- env fallback **위험**: production env 누락 시 in-memory shim silent → 모든 save 소실, 사용자 모름. `kvIsRemote` export 있지만 라우트가 체크 안함.
- 모니터링: Sentry/Datadog/Analytics 호출 0. `console.warn` 5건.
- 에러 트래킹: `catch { silently skip }` 다수 in cloud-sync.
- quota / GC 부재 인지: `api/resources/[id].ts:5` "orphans cost ~free; gc is a follow-up" 박제. KV 1MB 가드 0.

## 11. 발견 사항

### F-1 (Critical): API 라우트 입력검증·payload 한도·인증 모두 부재
- 위치: `apps/web/api/designs/index.ts:81-94`, `apps/web/api/resources/index.ts:67-126`, `apps/web/api/designs/[id].ts:30-49`
- 설명: POST 가 `body.id` string check 만 하고 `kv.set(key, body)` 통째 저장. payload 크기·구조·총 quota·rate-limit 부재. cookie 도용 = 즉시 takeover.
- 권장: valibot schema 검증 → 400 stable error code; Content-Length 가드 (2MB design / 10MB blob); KV size 가드 (1MB per key); cookie → HMAC signed token; Edge Middleware rate-limit.

### F-2 (Critical): device-cookie 단일 스코핑이 multi-tenant 아님이 어디에도 박제 안됨
- 위치: `apps/web/api/_lib/device-id.ts`, `apps/web/DEPLOY.md`
- 권장: `apps/web/CLAUDE.md` 또는 `DEPLOY.md` 에 "anonymous device-scoped, NOT multi-user" 명시 + 사용자 invitation 시점 인증 인계 plan 박제.

### F-3 (Critical): KV env 누락 시 in-memory silent fallback
- 위치: `apps/web/api/_lib/kv.ts:62-64`
- 설명: production 에서 env 누락 = `memoryClient` 사용 → save 가 cold-start 마다 소실, UI 는 "저장됨" 표시.
- 권장: `process.env.VERCEL_ENV === "production" && !hasRemoteKv` 시 boot throw 또는 health endpoint 503. client 에 명시적 경고 노출.

### F-4 (Major): 4개 escape-hatch mutation 이 Document mutation rule 우회
- 위치: `apps/web/src/document/use-design.ts:202-225` (`setPresentationOrder`, `reorderRootChildrenCb`, `setDesignBackground`, `addBehavior`)
- 설명: agocraft Patch variant 한계로 우회. `reorderRootChildren` 만 박제 코멘트 있음.
- 권장: 4개 모두 `weave.design.setBackground` / `weave.design.setPresentationOrder` / `weave.item.addBehavior` / `weave.design.reorderChildren` 명령으로 옮기고 Patch emit. agocraft 측 Patch variant 확장 의존 → **HANDOFF-007 발행**.

### F-5 (Major): `window.__weaveVm`/`__weaveEditor`/`__weaveDoc`/`__weaveDesign`/`__weavePeek` global 이 hot-path 침투
- 위치: `apps/web/src/pages/DesignPage.tsx:211,414-417`, `apps/web/src/document/interactions/selection-context.tsx:60`, `apps/web/src/document/interactions/interaction-mode.tsx:54`
- 설명: e2e 진단용으로 시작했을 가능성이 있으나 production hot-path 가 `window.__weaveVm` 을 읽음. **사용자 확정 (2026-05-25): 이 global 은 개발도구 용도** → `import.meta.env.DEV` 가드 의무.
- 권장: React Context 정식 provider (`InteractionModeContext`) 로 hot-path 회복. `__weave*` global 은 `if (import.meta.env.DEV)` 가드 + e2e 셋업 시 보장.

### F-6 (Major): `FrameStage.tsx` / `DesignPage.tsx` / `ContextualToolbar.tsx` 가 SRP 임계점
- 위치: 1942L / 1203L / 977L
- 권장:
  - `NestedFrame` → `pages/frame-stage/NestedFrame.tsx` 분리
  - drill-math 헬퍼 → `pages/frame-stage/drill-math.ts`
  - `FrameStage` binding 구성 → `useFrameStageBindings(editor, ...)` 훅
  - `ContextualToolbar` 의 kind 별 → `toolbar/sections/{Image,Video,Shape,Text,FrameBackground}Section.tsx` + `Record<DomainKind, Section>` 매핑
  - `DesignPage` 11 책임 → hook 모음 (`useCanvasHost`, `usePeekDrag`, `useMediaDialog`, ...)
  - `MIXED` / `sharedValue` / `isMixed` / `updateAll` → `toolbar/multi-edit.ts` 추출

### F-7 (Minor): `DOMAIN_RENDERERS` 객체 catalogue + `allowedChildKinds` 하드코딩
- 위치: `apps/web/src/document/domains/index.ts:20-31`, `apps/web/src/document/use-weave-editor.ts:128-131`
- 권장: `DomainCapability { kind, renderer, defaultAttrs, allowedAsChild, ... }` 통합 인터페이스 + registry. 새 kind = 새 capability 파일 1개.

### F-8 (Minor): `--motion-ease (0.4, 0, 0.2, 1)` asymmetric 이 crossfade/peek 에 사용
- 위치: `packages/design-system/src/tokens.css:69`, `apps/web/src/document/peek-mode/PeekOverlay.tsx:58,71-73`
- 설명: 메모 박제 "P2.X=0.2 burst" 케이스 그대로.
- 권장: `--motion-ease-symmetric: cubic-bezier(0.4, 0, 0.6, 1)` 토큰 추가, crossfade/peek/drill 에 사용. `--motion-ease` 는 entering element 전용 박제 코멘트.

### F-9 (Minor): 빈 Patch[] 반환 z-order adapter 가 history 의 진실성을 깬다
- 위치: `apps/web/src/document/zorder/design-frame.zorder.ts:36-46`
- 권장: agocraft Patch variant 확장 (**HANDOFF-007**) 후 흡수. 그 전까지 명령에 stable error code 로 "not undoable yet" 박제.

### F-10 (Nit): `seed.ts` / `ContextualToolbar.tsx` 하드코딩 hex
- 위치: `seed.ts:170,187`, `ContextualToolbar.tsx:456,463,538,551,589,789,805-806,881-882`
- 권장: `--color-fallback-neutral` 토큰 추가, ColorPicker mixed/empty fallback 에 사용.

### F-11 (Minor): `cloud-sync.ts` 의 silent catch 가 운영 디버깅 비용
- 위치: `storage.ts:317-323`, `cloud-sync.ts:46,141`
- 권장: dev 모드 `console.warn` 1회 + `cloudAvailable === false` UI 작은 indicator (header 우상단 red dot + tooltip "Cloud sync paused").

### F-12 (Minor): `e.target === e.currentTarget` portal-bubble guard 가 grep 미검출
- 위치: 없음 (의도된 가드 패턴 부재)
- 권장: 박제 회귀 패턴 6개 가드 모음 `apps/web/CLAUDE.md` "회귀 가드 체크리스트" 절 추가.

## 12. 권장 후속 작업 우선순위

### Tier 0 (production 공개 전 차단)
1. **F-1 + F-2 + F-3 — API hardening + multi-tenant 명시 + KV env 검증** (1~2일)
2. **F-3 단독: KV env 누락 시 boot fail / 503** (2~3시간)

### Tier 1 (agocraft 와 묶음)
3. **F-4: 4개 escape-hatch 흡수** ← agocraft HANDOFF-007 의존
4. **F-9: zorder Patch 흡수** ← HANDOFF-007 의존
5. **F-2 응답: API stable error code 도입** ← agocraft HANDOFF-008 의존

### Tier 2 (코드 정리)
6. **F-5: `window.__weave*` → React Context + `import.meta.env.DEV` 가드** (0.5일)
7. **F-6: 3 거대 컴포넌트 분리** (2~3일)
8. **F-8 + F-12: 토큰 추가 + portal-bubble guard 박제** (0.5일)

## 13. 사용자 확정 사항 (2026-05-25)

- weave **production 공개 일정 있음** → Tier 0 (Critical 3건) 시급
- `__weave*` global 은 **개발도구 용도** → `import.meta.env.DEV` 가드 의무
- 3 HANDOFF 발행 → F-4/F-9 + F-2 응답 작업 unlock

## 14. 변경 이력

- 2026-05-25 — 초안 (this document)
