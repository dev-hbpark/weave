# AUDIT-007 — Rule 6 게이트 드리프트 + 게이트 사각지대 위반 카탈로그 (2026-06-01)

> 번호 주: 같은 날 다른 세션이 `AUDIT-006`(MVVM 계층 분리)을 선점하여 본 기록은 `AUDIT-007`로 채번했다.

## Metadata

| Field | Value |
|---|---|
| ID | AUDIT-007 |
| Scope | `workspace/weave` + `workspace/agocraft` + `workspace/small-think` (소스 전체) + OS-root 게이트 자산 |
| Trigger | 사용자 요청 — "새로 업데이트된 코드 작성 규칙 워크플로우를 따르지 않은 코드를 모두 조사 + 예외 적용까지". 커밋 `22f3eaa`(SOLID/GRASP/IoC 트리거 + Rule 6 게이트 문서 동기화) 직후 재감사 |
| Date | 2026-06-01 |
| Status | **CLOSED (2026-06-01)** — ①②③ 완료 + ④ 종결(무의미 확인: 강화 게이트가 잡는 유일 agocraft switch `renderable.ts:122`는 이미 allowlist 등록, 나머지 후보는 gate-blind라 pin inert). weave 293·core 717·prefs 31 tests green · 3 게이트 green · 회귀 0. 3개 리포 커밋·push 완료(weave `c53a03d` / agocraft `b0d09d8` / OS-root `d142d59`, 전부 origin/main 반영). |
| Cross-references | `docs/04-specialized-engineering/CODE_STRUCTURE_DESIGN_RULES.md` § Rule 3·6, [AUDIT-005](AUDIT-005-2026-06-01-rule6-re-audit.md), [AUDIT-002](AUDIT-002-2026-05-25-declarative-branching.md) |

## 1. 핵심 발견 — 게이트 "green"은 3겹의 false-green

AUDIT-005(2026-06-01, 같은 날 선행)가 OS-root 게이트와 agocraft 로컬 게이트를 고친 뒤 "양 게이트 green = 문서화된 예외만 잔존" 으로 종료했다. 그러나 재감사 결과 **green 은 여전히 신뢰할 수 없다.** 세 겹이 겹쳐 있다.

### (a) 게이트 드리프트 — weave·small-think 로컬 게이트가 stale (가장 심각)

AUDIT-005 §5 는 "weave(OS-root 게이트) + agocraft(로컬 게이트)" 를 고쳤다고 기록했으나, **weave 와 small-think 는 각자 로컬 `tools/check_declarative_dispatch.sh` 를 갖고 있고 그 파일은 고쳐지지 않았다.** 두 파일은 byte-identical 한 stale 버전으로, AUDIT-005 가 (a) 로 지목한 바로 그 **ERE 다이얼렉트 버그**를 그대로 갖고 있다:

```sh
PATTERN_SWITCH='switch[[:space:]]*\([^)]*\.\(kind\|type\|mode\|category\)[[:space:]]*\)'
```

`grep -E`(ERE) 에서 `\(kind\|type\|mode\|category\)` 는 *리터럴* 텍스트 `(kind|type|mode|category)` 를 의미한다 — 소스에 그 문자열이 그대로 나타날 일은 없으므로 **switch 검출은 완전한 no-op**. `else if` 패턴도 없고(`PATTERN_MODE_IF` 만 있음), `variant`/`shape` 판별자도 없고, 주석-skip 도 없다. 즉 두 프로젝트의 `OK: no Rule 6 violations` 는 **아무것도 검사하지 않은 결과**였다.

검증: OS-root 정본(수정본) 게이트를 두 프로젝트 소스에 직접 실행 →
- weave: 여전히 green (위반들이 전부 bare-switch 라 (b) 로 회피 — 아래).
- small-think: `packages/llm/src/mapping.ts:89 else if (block.type === "tool_use")` **1건 즉시 노출**. 로컬 broken 게이트가 *게이트-검출 가능한 else-if 조차* 숨기고 있었다.

### (b) backstop 한계 — 수정된 게이트도 못 잡는 형태

OS-root 정본조차 다음을 못 잡는다 (게이트 헤더가 명시: "green != no violations"):
- **bare `switch (kind)`** — `PATTERN_SWITCH` 는 멤버 접근(`.kind`)을 요구하고, `PATTERN_SWITCH_BARE` 는 `firstKind|firstType|currentMode|active(Kind|Type|Mode)` 만 커버. 지역 변수 `kind`/`shape`/`variant`/`hoveredKind` 로 받은 뒤 `switch (kind)` 하면 전부 회피.
- object catalogue (`const X = { kindA: …, kindB: … }`) — anti-pattern #189.
- `else if` 없는 분리 sibling `if` 체인.
- `k === "a" || k === "b"` 멤버십 체인 / `[...].includes(x.kind)`.
- 판별자 화이트리스트(kind/type/mode/category/variant/shape) 밖의 이름(`hoveredKind`, `sentiment`, `behavior.kind` 의 bare 형태 등).

### (c) 실제 위반 잔존 — §2~§4 카탈로그

(a)·(b) 사각지대에서 신규/미해결 위반이 실제로 발견됐다. 전부 소스로 직접 확인.

## 2. weave 위반 카탈로그 (전부 게이트 사각지대)

AUDIT-005 가 V-4/V-8/V-11/V-12(DomainKind 클러스터·InteractionRow·hotspot-action)를 리팩토링한 것은 확인됨(`DOMAIN_RENDERERS` 가 `domain-kinds.ts` 의 exhaustive 테이블에서 `Object.fromEntries` 로 파생). 아래는 **그 패스가 남긴 두 번째-사이트 / 미해결 drift**.

| ID | 위치 | 판별자 | 분기 | 심각도 | 비고 |
|---|---|---|---|---|---|
| **V6-1** | `apps/web/src/pages/PropertiesPanel.tsx:374` `describeInteraction` | `behavior.kind` (bare `switch (kind)`) | 3 | **Major** | 동일 파일 335행이 V-11 레지스트리 `getInteractionRow(behavior.kind)`. 요약 문자열용으로 **같은 union 을 분기하는 두 번째 사이트** — 규칙의 "second site is a smell" 정조준. 요약 문자열은 `interaction-rows` adapter 필드여야 함. |
| **V6-2** | `apps/web/src/document/tooltip/CursorTooltipBridge.tsx:68` `resolveTargetElement` | `hover.hoveredKind` (bare switch) | 7 | **Major** | `document/tooltip/hover-describer.ts:171` 의 `REGISTRY: Record<HoverKind, Describer>` 가 이미 같은 판별자를 dispatch. kind→DOM셀렉터 병렬 두 번째 사이트. |
| **V6-3** | `apps/web/src/pages/ThumbnailPanel.tsx:48` `flavorIconForKind` | DomainKind (switch) | 4 | **Minor** | kind→아이콘이 `domain-kinds.ts` registry 밖. 게다가 **retired legacy kind(`slide`/`canvas-design`/`block-doc`/`media`)로 분기** — 신규 kind 는 조용히 `"mixed"` fallback. AUDIT-002 V-6 미해결. `DomainKindSpec` 에 `thumbFlavor` 필드로 흡수해야 함. |
| **V6-4** | `apps/web/src/document/tooltip/editor-hotkeys.ts:528` `frame.delete.visibleWhen` | `selectedKind` (`=== \|\|` 체인) | 5 | **Minor** | DomainKind 부분집합 하드코딩(line/qr 누락)으로 단축키 노출 결정. `KNOWN_DOMAIN_KINDS`/registry predicate 에서 drift. |

**추가 smell (분기 위반 아님):** `apps/web/src/document/use-weave-editor.ts:178` `allowedChildKinds` — AUDIT-005 가 명시적으로 deferred 한 항목. 현재 단일 `string[]` 리터럴(분기 아님)이나 **registry 에서 파생되지 않은 수기 리스트 + legacy kind(`slide` 등) 잔존** → kind 추가/retire 시 silent drift. `DESIGN_FRAME_KINDS`/`KNOWN_DOMAIN_KINDS` 에서 파생 권장.

## 3. agocraft 위반 카탈로그

| ID | 위치 | 판별자 | 분기 | 심각도 | 비고 |
|---|---|---|---|---|---|
| **A6-1** | `packages/core/src/schema/builtin-kinds.ts:413` `defaultShapeSubAttrs` (+`:753` `trianglePoints`) | `ShapeSubKind` / `TriangleVariant` (bare switch) | 11 (+4) | **Major** | `.declarative-allow` 에는 `:637` `shapeToSvgGeometry` 만 single-site 로 등록. `:413` 은 **동일 ShapeSubKind union 의 등록되지 않은 두 번째 dispatch 사이트** — shape 는 디자인툴 1순위 플러그인 확장면이므로 "second site" 위반. bare `switch (shape)` 라 게이트 회피(`.shape` 멤버 접근 아님). `ShapeKindAdapter { defaults(), toSvgGeometry() }` 레지스트리화 권장. |

**permitted (미위반, 게이트 사각지대지만 정당) — 향후 `.declarative-allow` pin 권장:** `domain-media/src/renderable.ts:325` `computeFitRect`(object-fit intrinsic union 순수 geometry), `domain-block-doc` canvas2d `variant` 삼항(닫힌 union 순수 렌더, `:122` 와 동류), `domain-media/src/ingestion.ts:87` `classify`(.includes 분류자=라벨 산출, 동작 dispatch 아님), `gesture/create-gesture-router.ts:166` `applyResult`(단일-site 프로토콜 reducer). 모두 닫힌 intrinsic union 위 단일-site 순수 변환.

## 4. small-think 위반 카탈로그 (AUDIT-005 범위 밖 — 최초 전수 감사)

small-think 는 AUDIT-002/005 범위(weave+agocraft)에 없었다. 전반적으로 Rule-6 모범적(switch 0개, 명시적 전이 테이블·exhaustive `HandlerMap`·registry+fallback·`isTerminal` 단일-source predicate). 다만:

| ID | 위치 | 판별자 | 분기 | 심각도 | 비고 |
|---|---|---|---|---|---|
| **S6-1** | `packages/preferences/src/learn.ts:148` `verbatimCommentDelta` | `Sentiment` (inline if-chain, bare) | 3 | **Minor** | 닫힌 `Sentiment` union 을 inline if 로 dispatch. `Record<Sentiment, fn>` 권장. `learn.ts` 전체에서 `sentiment` 가 3개 함수에 분기 → 4번째(`"mixed"`) 추가 시 Open-Closed 부채. **게이트 사각지대**(`sentiment` 는 판별자 화이트리스트 밖 + bare). |
| **S6-2** | `packages/llm/src/mapping.ts:89` `fromAnthropicResponse` `else if (block.type === "tool_use")` (+ `:29-33` `toContent` 분리 if 체인) | `LlmContentBlock.type` | 2 / 4 | — | **허용 예외 (미등록 → 본 감사에서 등록)**. Anthropic SDK (de)serialization 경계. `toContent`(직렬화)·`fromAnthropicResponse`(역직렬화)는 **역방향 형제**이지 같은-방향 두 번째 사이트가 아님 → "single-site invariant sibling / (de)serialization boundary" 정본 예외. small-think 에 `.declarative-allow` 가 없어 그동안 미등록 상태였고, broken 게이트가 이를 숨겨 옴. |

**미커밋 `deploy/cloudflare/worker.ts`:** config 리터럴(`SMALL_THINK_MAX_TOKENS 8192→16384`)만 변경 — Rule 6 무관, clean. (참고: `deploy/` 는 게이트 기본 `ROOTS="apps packages"` 에 없어 스캔조차 안 됨.)

## 5. 예외 적용(allowlist) 평가

- **agocraft `.declarative-allow`** (33건, 라인-핀): serializer/history/patch single-site, capability intrinsic, selection typeguard, topology pure-transform, A-1(WI-028 governed-deferral)/A-2(영구) — 전부 정당. 단 **A6-1(`builtin-kinds.ts:413`)이 빠져 있고 이는 예외가 아니라 진짜 위반** — allowlist 추가 금지, 리팩토링 대상.
- **weave `.declarative-allow`** (4건): ContextualToolbar 주석, migrate-shape-to-line ×2, changeToPatch single-site — 정당. 단 V6-1~V6-4 신규 위반 미반영(예외 아님 — 리팩토링 대상).
- **small-think**: 파일 부재 → 본 감사에서 신설(S6-2 등록).

## 6. 리메디에이션 계획 + 진행 로그

**① 게이트 드리프트 수정 (완료 2026-06-01).**
- `workspace/weave/tools/check_declarative_dispatch.sh` ← OS-root 정본(`tools/check_declarative_dispatch.sh`, ERE 정상 + else-if/variant/shape + 주석-skip)으로 교체.
- `workspace/small-think/tools/check_declarative_dispatch.sh` ← 동일 교체.
- agocraft 로컬 게이트는 OS-root 와 **기능적으로 동일**(주석 문구만 차이) → 변경 불필요.
- `workspace/small-think/.declarative-allow` 신설 — S6-2(`mapping.ts:89`, (de)serialization 경계 역방향 형제) 정당화 등록.
- **검증**: weave 게이트 green(여전히 backstop 한계로 V6-* 회피 — §1(b)), small-think 게이트 green(S6-2 등록 후). agocraft green 유지.
- **주의**: small-think 게이트 green 은 S6-1(learn.ts) 이 깨끗하다는 뜻이 *아님* — S6-1 은 게이트 사각지대다. green 의 의미 = "게이트-검출 가능 범위에서 문서화된 예외만 잔존".

**② 게이트 정규식 보강 (완료 2026-06-01).** `PATTERN_SWITCH` 를 멤버-전용(`[^)]*\.kind`)에서 **"최종 식별자가 판별자 단어(kind|type|mode|category|variant|shape)로 끝나는 모든 expr"** 로 확장 — bare `switch (kind)`/`switch (shape)`/`switch (variant)` + camelCase `switch (hover.hoveredKind)`/`switch (ctx.selectedKind)`/`switch (firstKind)` 를 모두 검출(V6-1/V6-2/A6-1 이 회피하던 형태). `PATTERN_ELSE_IF` 도 동일 expr 로 확장. `PATTERN_SWITCH_BARE` 화이트리스트는 이 통합 패턴에 흡수돼 제거. ERE 에 `-i` 가 없어 판별자는 bare-lowercase + camelCase-suffix 양형을 명시 나열. 6단어 밖(`fit`/`role`/`status`/`state`/`op`…)은 false-positive(예: `realEstate`→`state`) 때문에 의도적 제외 — backstop 한계로 헤더에 명시.
- **정본 동기화**: OS-root `tools/` + `templates/project/tools/` + 3 프로젝트 로컬 게이트를 **모두 동일 정본으로 통일**(md5 일치) — ① 드리프트가 재발하지 않도록 영구 정렬.
- **보강이 표면화한 정당 예외**: weave `layoutChildFromTextAutoResize`(`derive-text-auto-resize.ts:52`, frozen 레거시 union compat 변환)·`entranceKeyframes`(`PresentPage.tsx:27`, 닫힌 애니메이션 mode→keyframes 순수 변환) 2건 — 둘 다 "pure transform over closed/frozen union, single-site" 허용 예외라 `.declarative-allow` 에 정당화 등록(agocraft paint/filter geometry 처리와 동일). agocraft·small-think 는 신규 노출 0건.
- **검증**: 3 게이트 green(보강+allowlist) · allowlist 무시 시 weave 5건 노출(게이트가 live 임을 증명) · 합성 `switch (kind)` 검출 확인 · `bash -n` 구문 OK.

**③ 위반 리팩토링.**

- **weave V6-1~V6-4 (완료 2026-06-01).**
  - **V6-1** — `interaction-rows` 에 read-only **summary 레지스트리** 추가(`registerInteractionSummary`/`getInteractionSummary`, `types.ts`). `reveal-on-step.ts`(신규 모듈)가 summary 를 소유하고 barrel 에서 등록. `PropertiesPanel.describeInteraction` 의 `switch (kind)` → `getInteractionSummary(behavior.kind)?.(behavior) ?? behavior.label ?? "—"`. camera-target/hotspot 가지는 **죽은 코드**(해당 kind 는 editor row 를 가져 read-only 경로에 도달 안 함)라 Decommission Sweep 으로 제거. 호출부 `describeInteraction(unit.kind, behavior)` → `describeInteraction(behavior)`.
  - **V6-2** — `CursorTooltipBridge.resolveTargetElement` 의 `switch (hover.hoveredKind)` → 컴파일러-exhaustive `Record<HoverKind, HoverTargetSelector>` 룩업 테이블(`byId` 헬퍼가 id 미도착 시 null 단축). `line`→null(구 default), `background`→id 불요, `none`→null 등 **동작 정확히 보존**.
  - **V6-3** — `ThumbnailPanel.flavorIconForKind` 의 `switch (kind)` → frozen `RETIRED_KIND_FLAVOR` 룩업 테이블 + `?? FRAME_KIND_FALLBACK`. 키는 `migrate-frame-only` 가 로드 시 재작성하는 **retired doc-kind** (닫힘·증식 불가) — 동작 동일, allowedChildKinds 디커미션 시 제거 예정.
  - **V6-4** — `editor-hotkeys` `frame.delete.visibleWhen` 의 `selectedKind === … || …` 멤버십 체인 → `typeof ctx.selectedKind === "string" && KNOWN_DOMAIN_KINDS.has(ctx.selectedKind)`(domain-kinds.ts 단일 소스). **동작 변경(의도된 drift 수정)**: 누락돼 있던 `line`/`qr` 이 이제 Delete 액션을 노출(올바른 동작). `multi`/`none` 은 계속 제외.
  - **검증**: web typecheck clean · vitest **293 passed** · 게이트 green · biome 변경파일 0 error(잔여 3 warning 은 본 작업과 무관한 기존 코드). e2e 영속화 테스트는 AUDIT-005 §5 의 사전-존재 환경 이슈로 제외.
  - **미해결(별도)**: `allowedChildKinds` drift(§2 추가 smell) 는 분기 위반이 아니라 이번 패스 범위 밖 — registry 파생으로 별도 처리.
- **agocraft A6-1 (완료 2026-06-01).** `packages/core/src/schema/builtin-kinds.ts` 의 `defaultShapeSubAttrs`(seed)·`shapeToSvgGeometry`(render) 두 `switch (shape)` 병렬 사이트를 **단일 `SHAPE_KIND_ADAPTERS` 레지스트리**(컴파일러-exhaustive `Record<ShapeSubKind, ShapeKindAdapter>`, shape 당 `{ defaultSubAttrs, toSvgGeometry }` 어댑터 1개)로 통합. 두 public 함수는 thin resolver 로 축소(시그니처·동작 보존). 상관-유니온 한계는 제네릭 인덱서 `resolveShapeKind<K>` 로 **cast 0개** 해결. `trianglePoints` 의 `switch (variant)` → 컴파일러-exhaustive `TRIANGLE_POINTS` Record(`equilateral`≡`isosceles-up` 공유). 레지스트리는 module-private(공개 API 는 named 함수 유지 — Rule 2 object-catalogue 금지 준수). `.declarative-allow` 의 `builtin-kinds.ts:637` 엔트리 제거(switch 소멸 — 더 이상 예외 불필요). **검증**: core typecheck clean(cast 0) · vitest **717 passed** · 게이트 green · builtin-kinds.ts 내 switch 0개(잔여 grep 은 주석) · biome 0 error(잔여 6 warning 은 본 작업과 무관한 기존 `smoothPolyPath` 단언).
- **small-think S6-1 (완료 2026-06-01).** `packages/preferences/src/learn.ts` 의 `verbatimCommentDelta` 의 `if (sentiment === …)` 체인(3분기) → 컴파일러-exhaustive `VERBATIM_COMMENT_DELTA: Record<Sentiment, (comment) => PreferenceDelta>` 룩업 테이블(`HANDLERS`/`STOP_REASON` 관용 일치). 함수는 thin resolver 로 축소. `sentimentOf`(classifier)·`structuralDelta`(concern 별 guard)는 §4 분류대로 permitted 라 미변경. **검증**: preferences typecheck clean · vitest **31 passed**(learn.test.ts 16 포함) · 게이트 green · biome 0 error/0 warning.

**④ 허용 예외 pin 보강 (미착수, 선택).** agocraft `.declarative-allow` 에 computeFitRect/classify/block-doc canvas2d variant 등 게이트 사각지대 정당 예외를 정당화 주석과 함께 등록 — 향후 ② 정규식 강화 시 오탐 방지.
