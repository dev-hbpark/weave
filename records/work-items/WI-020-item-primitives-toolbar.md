# WI-020 — Item primitives (image / video / shape) + Canva-style ContextualToolbar

## Metadata

| Field | Value |
|---|---|
| ID | WI-020 |
| Type | feature (consumer of agocraft primitive) + design-system growth + UI integration |
| Owner (weave) | hbpark |
| Counterpart (agocraft) | HANDOFF-006 / WI-015 |
| Date opened | 2026-05-24 |
| Severity | P2 — feature, no regression risk to existing UX |
| Status | **Open — DR-design-009 sign-off + agocraft WI-015 Phase 0 ready** |
| Related | DR-014 (ContextualToolbar adapter), DR-design-009 (primitives), agocraft WI-015, HANDOFF-006 |

## Problem

weave 사용자는 디자인 캔버스에 **사진 / 동영상 / 도형** 같은 표준 편집툴 primitive 추가 + 선택 후 속성 편집을 기대. 현재 weave는:

- 4 top-level kinds (slide / canvas-design / block-doc / media) 만 지원. image/video 별개 kind 없음 (media tone으로만 표현).
- canvas-design 내부 attrs.shapes는 4-속성 mini-shape만. 10 sub-kind 다양성 부재.
- 선택된 item 의 속성 편집 UI 없음 — frame 조작 (move/resize/rotate) 만 가능. fill/stroke/opacity/filter 등 일반 속성은 편집기 부재.

이는 표준 디자인 도구 (Canva / Figma / Keynote) 의 baseline에 미달. 사용자 onboarding + 일상 작업 효율의 직접 차이.

## Desired

| 측면 | 목표 |
|---|---|
| Item primitives | image / video / shape (10 sub-kinds) 3 신규 top-level kind 지원 |
| Add commands | weave.image.add / weave.video.add / weave.shape.add — Toolbar/메뉴/PoC drag flow에서 사용 |
| Update commands | weave.X.update (patch-emitter, type-safe) — 모두 ChangeStream / History 통과 |
| ContextualToolbar | 단일 selection 시 헤더 아래 중앙에 mount, kind/sub-kind 별 editor section |
| Property editors | 7 신규 design-system primitive (DR-design-009) |
| Selection-driven UI | selection 비어있으면 unmount. peek/drag/drill 중에는 yield |
| Reduced motion | `prefers-reduced-motion: reduce` 시 toolbar enter/exit 즉시 |

## Acceptance Gate

### Phase 0 — Contracts ready

1. agocraft WI-015 Phase 0 완료 — `ImageAttrs` / `VideoAttrs` / `ShapeAttrs` + 4 visual specs type-only published.
2. DR-014 (ContextualToolbar adapter) accepted.
3. DR-design-009 (7 primitives) accepted + design-system-agent sign-off.

### Phase 1 — Design System growth (DR-design-009)

4. `@weave/design-system`에 7 primitives 박제 — ContextualToolbar + ColorPicker + NumberSlider + RangeSlider + SegmentedControl + IconToggleGroup + DashPatternPicker.
5. `@radix-ui/react-slider` 신규 의존 추가 — `library-adoption-supply-chain-governance-agent` sign-off.
6. 3 theme (Aurora / Mono / Vivid) visual 검증.

### Phase 2 — agocraft WI-015 consumption + adapter wiring

7. agocraft WI-015 Phase 4 publish 완료 → weave deps bump → `pnpm install`.
8. `useWeaveEditor` 에서 `registerBuiltinItemKinds(schema)` 호출 + `documentTypes.allowedChildKinds` 확장 ("image", "video", "shape" 추가).
9. ZOrder + Manipulation capability adapter 3종 (graphic 공통) 등록.
10. unit test: schema 등록 / capability resolve / default attrs 빌더 호출 정확성 (8+ tests).

### Phase 3 — Rendering (3 React component sets)

11. `apps/web/src/document/render/ImageBlock.tsx` — ImageAttrs → `<img style={...filterToCss(...)}/>` 렌더링. Crop / fit / borderRadius / shadow / opacity 적용.
12. `apps/web/src/document/render/VideoBlock.tsx` — `<video>` 렌더. autoplay 정책 + trim + volume + 동일 시각 속성.
13. `apps/web/src/document/render/ShapeBlock.tsx` — SVG 렌더. agocraft `shapeToSvgGeometry` helper 호출 → SVG element + props 생성. 10 sub-kind 모두 visual snapshot 가능.
14. DOMAIN_RENDERERS map에 3 신규 kind 등록.

### Phase 4 — Commands

15. `apps/web/src/document/commands.ts`에 6 신규 command:
    - `weave.image.add`, `weave.video.add`, `weave.shape.add` (direct, item.children Patch)
    - `weave.image.update`, `weave.video.update`, `weave.shape.update` (patch-emitter)
16. PendingCreations 통합 — 새 kind 모두 add 시 Item 본체 staging.

### Phase 5 — ContextualToolbar integration

17. `apps/web/src/document/toolbar/ContextualToolbar.tsx` — selection watch + kind dispatch + editor section mount.
18. 12 editor sections — DR-014 §"Decision B" 매핑대로:
    - ImageEditor (Fit / Crop / Filter / BorderRadius / Opacity / Shadow / Rotation / More)
    - VideoEditor (Fit / Play / Trim / Volume / BorderRadius / Opacity / Shadow / Rotation / More)
    - ShapeEditor + 10 sub-kind 별 sub-section (Fill / Stroke / sub-kind-specific / Opacity / Shadow / Rotation / More)
    - 기존 4 kinds 의 minimal editor (DR-014에서 정의된 minimal set).
19. DesignPage header 아래 중앙에 mount — `position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 35`.
20. Peek-mode와 mutually-exclusive — peek 활성 시 toolbar fade-out.

### Phase 6 — Insertion UI

21. Toolbar의 "+" 메뉴 또는 헤더 좌측에 새 item 추가 entry (image / video / 10 shape sub-kinds + 기존 4 kinds).
22. 기존 RubberBand drag flow (insertable capability)에 신규 kinds 추가 — image/video/shape도 drag-to-create.

### Phase 7 — e2e + verification

23. `apps/web/e2e/item-primitives.spec.ts` 신규:
    - 각 신규 kind 추가 후 DOM에 mount + ContextualToolbar 노출.
    - 각 kind의 핵심 속성 변경 (image opacity, video trim, shape fill) → 즉시 반영 + Cmd+Z 복귀.
    - 10 shape sub-kind 모두 추가 가능.
    - selection 변경 시 toolbar editor section 갱신.
    - peek 모드 활성 시 toolbar unmount.
24. 기존 baseline e2e (53/5/0) 유지.
25. `pnpm typecheck` + `pnpm test --run` + `pnpm e2e` 모두 green.

### Cross-cutting

26. [[feedback_doc_mutation_must_hit_history]] — 모든 속성 변경이 editor.exec → ChangeStream → History 통과. Cmd+Z로 정확히 복귀. mergeKey로 drag-style 변경 (slider) 1 undo step에 collapse.
27. [[feedback_backdrop_filter_under_transform]] — Toolbar의 backdrop-filter는 `translateZ(0) + will-change: backdrop-filter` + `isolation: isolate` 박제.
28. [[feedback_design_system_triage_mandatory]] — 모든 신규 UI는 design-system primitive 경유, inline lookalike 0.

## Phase 표

| Phase | 산출 | 의존 | 상태 |
|---|---|---|---|
| 0 — Contracts | DR-014 + DR-design-009 박제, agocraft WI-015 Phase 0 ready | agocraft WI-015 Phase 0 | 🔵 ready |
| 1 — DS growth (7 primitives) | ContextualToolbar + ColorPicker + NumberSlider + RangeSlider + SegmentedControl + IconToggleGroup + DashPatternPicker | DR-design-009 sign-off | ⏳ (parallel) |
| 2 — Adapter wiring | registerBuiltinItemKinds + capability adapters 등록 | agocraft WI-015 Phase 4 publish | ⏳ |
| 3 — Rendering | ImageBlock + VideoBlock + ShapeBlock + DOMAIN_RENDERERS | Phase 2 | ⏳ |
| 4 — Commands | 6 신규 commands + PendingCreations 통합 | Phase 2 | ⏳ |
| 5 — Toolbar integration | ContextualToolbar mount + 12 editor sections + selection watch | Phase 1 + Phase 4 | ⏳ |
| 6 — Insertion UI | Add entry + drag-to-create extension | Phase 4 + Phase 5 | ⏳ |
| 7 — e2e + verify | item-primitives.spec.ts + baseline maintain | Phase 6 | ⏳ |

## Risks (weave 측)

| Risk | 영향 | 대응 |
|---|---|---|
| Toolbar 폭이 모든 editor section을 fit 못함 | 작은 viewport (1280px) 에서 overflow | More dropdown fallback (DR-014). v1은 12 sub-kinds 모두 minimal 노출 가능하도록 width tuning |
| ColorPicker popover가 frame과 겹쳐 클릭 충돌 | UX 깨짐 | Toolbar는 header 바로 아래 (z 35), popover는 위로 collision-aware. Radix Popover의 `side="bottom"` + `collisionPadding` |
| 10 sub-kind shape의 SVG geometry 정확성 | 시각 오류 | agocraft Phase 2의 unit test 정확성에 의존. weave Phase 7 e2e visual snapshot 1-2 sub-kind 추가 |
| Peek-mode와 Toolbar mount 동시 | conflict UI noise | DR-014 §"Mitigations" — peek 활성 시 toolbar fade-out 220ms |
| Multi-selection 시 toolbar 미사용 (deferred to v2) | 사용자가 단일 선택 강제됨 | DR-014 §"Decision C" — toolbar mount 안 함 정책. tooltip "선택된 단일 item만 편집 가능" 안내 (v2에서 multi-edit 도입) |
| Frame drag 중 toolbar 위치 follow | drag 중 toolbar 흔들림 | drag 시작 시 toolbar freeze, drop 시 재계산 |

## Cross-project channel

이 WI의 agocraft 측 작업은 `workspace/agocraft/records/decision-handoffs/HANDOFF-006-item-primitives.md`로 inbox 발송. agocraft WI-015이 응답. 본 문서는 weave 측 책임 / acceptance gate / 회귀 risk만 기록.

## Status log

- 2026-05-24 — 본 WI 발행, HANDOFF-006 동시 발행, DR-014 + DR-design-009 proposed.
- 2026-05-24 (Phase 6) — Figma-style 도형 채우기. agocraft `PaintSpec` 에 `image` / `video` 변형 + `MediaPaintFit` 추가, `paintToCss` / `paintToSvgFill` 갱신. weave `ShapeBlock` 가 image 는 `<pattern>` + `<image>`, video 는 `<foreignObject>` + `<video>` (geometry clipPath) 로 렌더. `ContextualToolbar` Fill section 에 `🖼` / `▶` 버튼 추가 + 활성 시 media chip + 비우기(×). `DesignPage.pendingMedia` 가 `add | edit | fill` 셋의 discriminated union 으로 확장. e2e: `apps/web/e2e/shape-media-fill.spec.ts` 3/3 PASS, adjacent (item-primitives + media-src-dialog + history-item-lifecycle) 11/11 PASS, agocraft visual.test 26/26 PASS. Published as `@agocraft/core@1.0.0-rc.20260524111628`. DR-023 Amendment 1 박제.
- 2026-05-24 (Phase 20) — Vercel 배포 + 클라우드 저장소 (Vercel KV + Blob, 익명 device-ID). 사용자: "이서비스를 워크스페이스를 활용할수있게 저장소까지 준비해서 vercel.app으로 배포할 수 있어?". 결정 3 (Storage = Vercel KV+Blob, Identity = 익명 device-ID 쿠키, Scope = MVP).
  - **API routes** (`apps/web/api/`): `_lib/device-id.ts` (weave_did 쿠키 read/issue, 5년 maxAge, KV scope key 헬퍼), `_lib/kv.ts` (Vercel KV 클라이언트 + dev 환경용 in-memory fallback), `designs/index.ts` (GET list / POST upsert + 인덱스 키 유지), `designs/[id].ts` (GET / DELETE), `resources/index.ts` (GET list / POST upload — production 에선 `@vercel/blob` 으로 data: URL → Blob 변환, dev 에선 data: URL 그대로 KV 에 저장), `resources/[id].ts` (DELETE).
  - **Client refactor**: 새 모듈 `src/document/cloud-sync.ts` — `bootstrapFromCloud()` (앱 mount 시 KV→localStorage 시드), `pushDesignCloud / deleteDesignCloud / uploadResourceCloud / deleteResourceCloud` (fire-and-forget mirror). `App.tsx` 가 mount 시 bootstrap 호출. `storage.saveDesign` / `clearDesign` 과 `resource-storage.addResource` / `removeResource` 가 lazy import 로 cloud-sync 호출 → 기존 sync API 유지하며 백그라운드로 클라우드 미러. 네트워크 실패 시 silent fallback (localStorage-only 모드).
  - **vercel.json**: Vite preset, build = `pnpm --filter @weave/web build`, output = `dist`, install = `pnpm install --frozen-lockfile`. `/api/*` 제외 모든 경로 → `index.html` (SPA fallback). `/api/*` Cache-Control no-store, `/assets/*` immutable. `.vercelignore` 로 test/build artifacts 제외.
  - **deps**: `@vercel/kv ^3`, `@vercel/blob ^0.27`, devDep `@vercel/node ^5`, `@types/node`. pnpm install 정상, vite build green (744 KB gzipped 235 KB).
  - **`DEPLOY.md` 작성**: 1) agocraft deps 처리 3 옵션 (npm public publish / vendor tarballs / GitHub Packages, 추천 = vendor), 2) GitHub push, 3) Vercel 프로젝트 생성 + Root Directory = `apps/web`, 4) Storage tab 에서 KV + Blob enable (env var 자동 주입), 5) Deploy. 트러블슈팅 매트릭스 + 운영 키 layout 도식 + 향후 hardening (real auth, conflict resolution, quota/gc).
  - 회귀: workspace + text-item + media-src-dialog 16/19 PASS (3 parallel-load timeout flake — 격리 시 모두 PASS, cloud-sync fetch 의 timeout race 추정).
  - **사용자 액션**: `DEPLOY.md` 1~5 단계 그대로 따라가면 `weave-app-XXX.vercel.app` URL 발급. `vercel deploy` 자체는 Vercel 대시보드 UI 클릭으로 진행됨 (CI 인증 필요해 클로드가 대신 실행 불가).

- 2026-05-24 (Phase 19) — 워크스페이스 페이지 + 리소스 라이브러리 + 리소스 픽커. 사용자: "이제 워크스페이스페이지를 추가하고 생성한 디자인을 저장하고 다시 열어서 확인할수있으면 좋겠어 업로드한 이미지나 비디오도 별도 리소스 영역에서 확인 가능하면 좋겠어 그리고 그요소들은 이미지나 비디오 추가할때 목록으로 보여주고 바로 추가하길 원해".
  - **`storage.listAllDesigns()`**: `weave.design.v5.*` 키 enumerate → `DesignSummary[]` (id, title, width, height, background, createdAt, updatedAt) 반환. 새로운 export.
  - **`resource-storage.ts` 새 모듈**: `weave.resource.v1.<id>` 키에 `MediaResource = { id, kind: "image"|"video", src, name, addedAt, sessionOnly }` 저장. `addResource(kind, src, name)`, `listResources()`, `removeResource(id)`, `clearAllResources()`. blob: URL 은 reload 후 sessionOnly=true 자동 flag.
  - **`LandingPage` 재작성 (`/`)**: 기존 마케팅 copy 대신 워크스페이스 — 헤더 + "내 디자인" 헤드라인 + 새 디자인 시작 CTA + **저장된 디자인 그리드** (3 column, 카드는 background-tint 썸네일 + 제목 + 사이즈/aspect + 마지막 수정 시각, hover 시 × 삭제 버튼) + **리소스 패널** (6 column 정사각 썸네일, 이미지 = 미니 프리뷰, 비디오 = ▶ + 파일명, sessionOnly 인 경우 "이번 세션만" 뱃지, hover 시 × 삭제). `storage` 이벤트 리스닝하여 다른 탭 변경 시 자동 갱신.
  - **자동 등록**: `MediaSrcDialog` 의 파일 업로드 성공 시 `addResource(kind, src, name)` 호출. 이미지는 영구, 비디오는 sessionOnly.
  - **리소스 픽커**: `MediaSrcDialog` 의 드롭존 위에 "기존 리소스" 가로 스크롤 썸네일 — kind 일치하는 항목만 노출. 클릭 시 URL 필드와 uploaded chip 이 그 resource src/name 으로 채워져서 confirm 시 재업로드 없이 즉시 추가.
  - e2e: `apps/web/e2e/workspace.spec.ts` 4/4 PASS (저장된 디자인 카드 + 클릭 → 편집기 · 업로드된 이미지 리소스 패널 등장 · 두 번째 디자인에서 픽커로 재사용 · × 삭제). 기존 `present-poc` 의 landing assertion 도 새 "내 디자인" 헤딩에 맞춰 갱신. 회귀 sweep 35 PASS / 1 skip.

- 2026-05-24 (Phase 18) — 텍스트 박스: 세로 핸들 제거 + 줄바꿈 따라가는 자동 height + 한 글자 최소 너비. 사용자: "텍스트 아이템은 가로와 대각선의 크기조정만 가능하고 높이는 줄바꿈으로 인해 자연스럽게 변경되길 원해 … 엔터를 치면 자동으로 아래쪽으로 늘어나게 되어야 해".
  - **n/s 핸들 제거**: `FrameStage` 의 `createFrameDefaultViewModel` 호출 시 `kind === "text"` 면 `resizeDirs: ["e","w","ne","nw","se","sw"]` 만 전달. n/s edge 핸들이 렌더되지 않음. height 는 콘텐츠가 결정.
  - **Auto-height (ResizeObserver)**: `TextBlock` 이 inner content 의 `scrollHeight` 를 관찰. parent 의 viewport height 와 ratio 계산 후 `frame.height` 와 비교 (현재 `frameRef` 와 직접 비교 — `lastSent` 캐시는 다른 곳에서 덮어쓴 뒤에 재수렴 못 하던 race 때문에 제거). 변화 있으면 `onUpdate({ frame: { ...frame, height: rounded } })` dispatch. 결과: Enter 로 줄 추가, 폭이 좁아져 wrap, 폰트 변화 — 모두 자동으로 박스가 늘거나 줄어듦.
  - **Min-width = 한 글자**: `frameAccess.readFrame` 이 text item 면 `__designWidth` 도 frame 에 embed. `computeResize` 에서 text + (corner 또는 w/e) 시 `(fontSize * 0.6) / designWidth` 미만으로 못 내려가도록 clamp.
  - **Corner = 너비-축 만 비례**: Phase 15 의 corner 비례가 `max(scaleX, scaleY)` 였는데 height 가 이제 자동이라 의미 없음 — `scaleX` 만 사용하도록 단순화. fontSize 는 같은 scale 로 따라감. height 는 ResizeObserver 가 처리.
  - **`overflow: visible`**: TextBlock outer container 가 `overflow: hidden` 이면 height 가 따라잡기 전 한 프레임 동안 잘림 — `visible` 로 변경.
  - e2e: `text-item.spec.ts` 10/10 PASS — Add 메뉴 · fontSize · 비례 corner · edge resize · font-family · Enter 줄바꿈 · n/s 핸들 없음 · Enter 로 height 자동 증가 · width 좁히면 wrap + height 증가 · min-width clamp. 회귀 sweep 45 PASS / 2 skip / 1 parallel flake (격리 시 PASS).

- 2026-05-24 (Phase 17) — 텍스트 inline 편집을 click → dblclick 으로. 사용자: "다큐먼트와 텍스트 아이템 모두 텍스트를 한번 클릭하면 바로 입력 가능상태가 되는데 단일 클릭은 선택 이동이 그대로동작하고 더블 클릭을 해야만 수정이 가능하게 해줘".
  - **EditableText `clickToEdit: "single" | "double"`**: default "single" (기존). "double" 시 element 가 contentEditable=false 로 시작 → dblclick → setIsEditing(true). `data-double-click-edit="true"` 도 같이 박아서 frame click 핸들러가 zone 을 인식. useEffect 가 isEditing=true 트랜지션 시 focus + selectAll. 거기에 더해 dblclick 핸들러 안에서도 sync 하게 `setAttribute("contenteditable", "true") + focus()` — React render 가 미뤄지더라도 같은 task 내에서 cursor 가 들어가도록.
  - **모든 frame renderer 의 inline EditableText 에 `clickToEdit="double"` 박기**: SlideBlock (title + bullets), DocBlock (heading + paragraphs), MediaBlock (caption), TextBlock.
  - **NestedFrame.onClick 의 drill-in 카운터 건너뛰기**: target 이 `[data-double-click-edit="true"]` 안에 있으면 fit-to-frame 카운터 증가 안 함 — text 위 더블 클릭이 frame drill-in 으로 빠지지 않도록. select 는 그대로 (selectionId 변경 단일 click 시 동작).
  - **부수: 디자인 배경 toolbar 자동 마운트 revert**: Phase 14 에 추가했던 `selectedIds.size===0 → kind="design"` variant 의 자동 마운트가 top-right 코너에 위치해도 full-frame slide 의 title 영역 dblclick 을 가로채는 정황이 잡혀서 일단 다시 selection 기반으로 되돌림. 디자인 배경 편집은 explicit affordance (예: 빈 영역 우클릭 메뉴) 로 follow-up.
  - **EditableText cursor style**: clickToEdit="double" 모드에서 not editing 일 때는 `cursor-default` (text cursor 가 frame 선택/이동 의도와 충돌 안 하도록).
  - e2e: text-item.spec.ts 6/6 + 기존 slide-title/doc-heading/bullets 모두 dblclick({ position: {x, y} }) 로 갱신 (FULL_FRAME 슬라이드는 viewport 보다 넓어 element center 가 chrome/toolbar 영역에 떨어질 수 있어 explicit position 필요). background.spec.ts 의 "design 변형 자동 마운트" 테스트는 위 revert 에 맞춰 skip. 회귀: 44 PASS / 2 skip (1 pre-existing + design-variant skip).

- 2026-05-24 (Phase 16) — TextBox 후속: Enter 줄바꿈 + 폰트 패밀리 다양화. 사용자: "텍스트 박스인데 엔터로 줄바꿈이 되지 않는거같아" → "폰트패밀리도 다양하게 제공하면 좋겠어". 두 가지 해결:
  - **Enter 줄바꿈 (multiline)**: TextBlock 의 `<EditableText>` 가 기본값 `multiline: false` 라 Enter 가 commit 으로 잡혔음. `multiline` 활성화. 추가로 EditableText.commit() 이 `textContent` 만 읽고 있어서 contenteditable 의 `<br>`/`<div>` 가 무시 → "Line 1<br>Line 2" 가 "Line 1Line 2" 로 평탄화되던 버그. multiline 모드에서는 `innerText` 로 읽어 visual line break 를 `\n` 으로 보존하도록 변경 (single-line 은 textContent 유지 — innerText 가 layout flush 를 강제하므로 commit-마다의 perf 손실 회피).
  - **폰트 패밀리 다양화**: `apps/web/index.html` 에 Google Fonts preconnect + Inter / Noto Sans KR / Noto Serif KR / Playfair Display / JetBrains Mono / Caveat (4-7 weight) 로딩. `ContextualToolbar` 의 text section 에 새 **Family** dropdown 추가 — `DropdownMenu` + 프리뷰 (`<span style={{fontFamily}}>{label}</span>`) 로 각 옵션이 자기 폰트로 렌더. Mixed badge 도 함께. 6 프리셋: Inter / Noto Sans KR / Playfair / Noto Serif KR / JetBrains Mono / Caveat. `fontFamilyLabel(stack)` 유틸이 custom 값일 때 first family 이름으로 fallback.
  - e2e: `text-item.spec.ts` 가 6/6 PASS (Add 메뉴 · Toolbar fontSize · 비례 corner resize · edge resize · font-family 선택 · Enter 줄바꿈). 회귀: 40 PASS / 1 skip.

- 2026-05-24 (Phase 15) — TextBox primitive (agocraft `text` kind) + proportional corner resize. 사용자: "텍스트박스아이템도 agocraft의 기본 아이템으로 두고 싶어 폰트 패밀리 폰트사이즈 글자색 배경색등 텍스트 박스의 속성 처리가 모두 가능해야해 weave에서도 추가해서 사용할수있게 해줘 그리고 텍스트 박스는 핸들러의 리사이징 동작중 각 모서리를 사용한 대각선 리사이즈 동작이 폰트사이즈도 동일한 비율로 증가하는 동작으로 처리해줘".
  - **agocraft TextAttrs schema** (`packages/core/src/schema/builtin-kinds.ts`): `TEXT_KIND = "text"`. `TextAttrs = { frame, text, fontFamily, fontSize, fontWeight, fontStyle, color, background?, textAlign, lineHeight, letterSpacing, opacity, shadow, rotation? }`. `defaultTextAttrs(frame, text?)` factory. Export: `TEXT_KIND`, `TextAlign`, `TextAttrs`, `TextStyle`, `TextWeight`, `defaultTextAttrs`. `@agocraft/core@1.0.0-rc.20260524133731`.
  - **weave kind registration**: `DomainKind` 에 `"text"` 추가. `ItemAttrsByKind.text = TextAttrs`. `DOMAIN_REGISTRY`, `agocraft-mirror.isDomainItem`, `seed.createDefaultItem` (FULL_FRAME, default font/color), `insertable/design-root.KIND_GLYPHS.text = "T"` 모두 추가.
  - **TextBlock renderer** (`apps/web/src/document/domains/TextBlock.tsx`): 인라인 EditableText 로 `text` 필드 편집. fontFamily/fontSize/Weight/Style/color/textAlign/lineHeight/letterSpacing/opacity/background 가 모두 inline style 로 적용. design-pixel 좌표계 — 카메라/Stage transform 이 같이 스케일.
  - **Add menu**: 헤더 "+" 드롭다운에 별도 "텍스트" 섹션 (`add-text` testid).
  - **ContextualToolbar text section**: Font (R/B + 노/이태릭) · Size (NumberSlider 8-200px) · Align (L/C/R/J) · Color · Background (+ × clear) · Opacity. Multi-select 시 기존 sharedValue/Mixed badge 패턴 그대로.
  - **Proportional corner resize** (Figma parity): frameAccess 가 `findItem` 으로 kind 도 같이 읽고, `text` kind 면 `readFrame` 의 반환에 `__origFontSize` 를 embed. `computeResize` 가 corner dir (ne/nw/se/sw) + `__origFontSize` 존재 시 aspect-lock + `__newFontSize = __origFontSize * scale` 을 반환. edge dirs (n/s/e/w) 는 기존 free-resize 동작 유지. `commitFrame` 이 `__newFontSize` 있으면 frame + fontSize 를 **한 번의 `weave.item.update`** patch 로 묶어 dispatch — 두 번 분리하면 두 번째 patch 가 첫 patch 의 frame 을 stale 한 `prev.attrs` 로 덮어쓰는 race 가 있어 합쳤음.
  - e2e: `apps/web/e2e/text-item.spec.ts` 4/4 PASS — Add menu → 텍스트 · Toolbar text section + fontSize 변경 · corner resize 가 fontSize 도 같은 비율로 스케일 (20px→44.8px, width 0.2→0.448, 비율 일치) · edge resize 는 fontSize 변경 없음. 회귀: 35 PASS / 1 skip.

- 2026-05-24 (Phase 14) — 디자인 + 프레임 배경색 편집. 사용자: "디자인의, 다큐먼트의 배경색도 설정할수있게 해줘".
  - **Per-frame background**: SlideAttrs / CanvasAttrs / BlockDocAttrs / MediaAttrs 에 `background?: string` 추가. SlideBlock / CanvasBlock / DocBlock / MediaBlock 의 `<Card>` 가 `style={{ background }}` 로 칠함 (undefined = 투명 — 기존 동작 유지).
  - **ContextualToolbar Background section**: slide / canvas-design / block-doc / media 4 kind 에 ColorPicker + Clear(×) 버튼. 기존 multi-select / sharedValue / updateAll 패턴 그대로 — uniform 이면 single value, divergent 면 Mixed badge, 적용 후 uniform 되면 badge 자동 사라짐.
  - **Design background editor**: useDesign 에 `setDesignBackground(color)` 콜백 추가 — `setDesign((prev) => ({ ...prev, background: color }))` 으로 storage layer 가 자동 persist. ContextualToolbar 에 `designBackground` + `onChangeDesignBackground` props 추가 — selection 0 + props 가 wired 시 `kind="design"` variant 의 single Background ColorPicker 렌더. DesignPage 가 selection 0 일 때 top-right corner (top:12, right:12) 에 배치하여 frame body 의 title textbox 클릭 영역과 겹치지 않도록.
  - **부수 버그 수정**: NestedFrame.onClick 의 contenteditable/input/textarea 조기 return 가 stopPropagation 안 해서, 다중 선택된 frame 의 bullet textbox 를 클릭하면 click 이 outer `handleBackgroundClick` 으로 bubble → selection clear 되던 버그 해결.
  - e2e: `apps/web/e2e/background.spec.ts` 5/5 PASS (toolbar 마운트 · attrs.background 적용 · clear (×) · design 모드 · localStorage persist). 회귀: 40 PASS / 1 skip.

- 2026-05-24 (Phase 13) — Click swallower lifetime 버그 + Union recursive 보강. 사용자: "shift+click 은 동작하지 않고 드래그로 다중선택했을때 union bbox 는 잘못 표시되고 있어". 두 가지 근본 원인:
  1. **Click swallower 가 영구화** — Phase 10/12 에서 추가한 window-capture click swallower 는 click 한 번 받으면 자기를 제거. 그러나 큰 marquee/drag 후 브라우저가 합성 click 을 *suppress* 하면 (drag 임계값 초과 시 일반적) swallower 가 영구 부착되어 *사용자의 다음 의도된 click* (e.g. shift+click for multi toggle) 을 먹어버림. 해결: `setTimeout(() => removeListener, 0)` 으로 single-task lifetime 보장 — 합성 click 이 있으면 정상 swallow, 없으면 다음 task 시작 전 정리. MarqueeSelectionLayer.tsx + agocraft frame-manip.ts 양쪽.
  2. **Union chrome 이 root.children 만 봤음** — top-level frame 만 walk 해서 nested 선택 item 은 union 에 기여 못 함. 사용자가 shift+click 으로 nested shape 를 추가하면 chrome 이 그 shape 를 제외한 채로 그려짐. 해결: FrameStage 의 `multiSelectionUnion` 을 *recursive walk* 로 변경 — root 부터 자손들을 절대 design-pixel 좌표로 합성하며 내려가, selectedIds 에 있는 모든 노드(any depth)의 bbox 를 union 에 포함.
  `@agocraft/editor@1.0.0-rc.20260524130236` publish. e2e: `apps/web/e2e/multi-marquee-flow.spec.ts` 5/5 PASS (real marquee → shift+click toggle · real-marquee union geom · multi-drag chrome 따라옴 · nested 선택 item 포함 · programmatic 케이스). 회귀: 35 PASS / 1 skip.

- 2026-05-24 (Phase 12) — 다중 선택 UX 마무리: click-collapse 버그 + Union chrome. 사용자 피드백: "다중선택후에 어떻게 해야 이동이 가능한거야? 선택된 아이템들중에 하나를 다시 눌렀을때 다중선택이 풀려 그리고 ui가 다중선택일때는 선택된 모든 요소를 감싸는 셀렉션 핸들러가 표시되어야 하는거 아니야?". 두 가지 문제 발견 & 해결: (1) **Click-collapse**: 다중 선택된 frame 을 클릭(or 임계값 미만 드래그)하면 합성된 click 이 NestedFrame.onClick → onSelect(itemId) 으로 흘러 single 로 collapse. Phase 10 의 swallower 는 wasDrag 만 잡아 미세 클릭은 빠져나감. 처리: NestedFrame.onClick 을 multi-aware 로 변경 — `selectedIds.has(itemId) && size > 1 && no modifier` 시 no-op (preserve). 추가: shift / cmd / ctrl + click 시 `onToggleSelect(itemId)` (add/remove from multi). 사이드: agocraft `createFrameMoveBinding` 의 pointerdown 도 모디파이어 held 시 selection 변경 skip (이전엔 shift+click on unselected 가 binding 에서 single 로 set 한 뒤 onClick 이 toggle out → empty 결과). (2) **Union chrome**: FrameStage 의 design plane motion.div 안에 multi 시 모든 selected frame 의 bbox 합집합 outline 렌더. accent 색 2px outline + 4 corner dot + "N selected" badge (top-right). pointerEvents:none 으로 인터랙션은 기존 방식 유지 (multi resize 는 follow-up). `@agocraft/editor@1.0.0-rc.20260524125519` publish. e2e: `apps/web/e2e/multi-select-click.spec.ts` 4/4 PASS (plain click 보존 · shift+click 제거 · shift+click 추가 · chrome 가시성). 회귀: 30 PASS / 1 skip.

- 2026-05-24 (Phase 11) — 다중 선택 ContextualToolbar + Mixed-value indicator. 사용자: "다중 선택시에 선택된 모든 아이템이 갖고있는 속성은 툴바로 설정할수있으면 좋겠어. 예를 들면 도형만 다중선택되어있다면 모든 속성이 중복이기 때문에 툴바가 나오고 각기 다른 값을 가진 것들은 멀티 값을 가졌다는 표현이 되어야하고 속성을 설정하면 모두에게 동일하게 적용되면 될거같아. 모두의 값이 같아지면 멀티값이 아니라 그냥 단일 값과 같이 실제 값이 보이면 될거같아". 처리: (1) `ContextualToolbar` props 가 `selectedItem: ItemSnapshot | null` → `selectedItems: ReadonlyArray<ItemSnapshot>` 로 전환. 0개 → null, 같은 kind 끼리 multi → 그 kind 의 editor section, 서로 다른 kind 끼리 multi → null (편집 공통점 없음). (2) `sharedValue<T>(items, read, eq?)` helper — 모든 아이템이 동일 값이면 그 값, 아니면 `MIXED` 심볼 반환. (3) `MixedBadge` 컴포넌트 — 각 control 옆에 "Mixed" 라벨 (mixed 일 때만). (4) 모든 mutation 이 `updateAll(editor, ids, patcher)` 로 looping → 모든 선택에 동일 patch. uniform 으로 수렴하면 sharedValue 가 더 이상 MIXED 안 반환 → badge 자동 사라짐. (5) DesignPage 의 toolbar mount 조건이 `!peek.isActive && selectedIds.size > 0` 로 확장 (이전: `&& !isMultiSelect`). (6) image / video / shape 3종 kind 모두 multi-aware 컨트롤 (Source / Fit / Opacity / BorderRadius / Volume / Loop / Muted / Shape sub-kind / Fill color / Stroke color). e2e: `apps/web/e2e/multi-toolbar.spec.ts` 4/4 PASS (same-color uniform · diff-color Mixed · uniform 으로 수렴 · 혼합 kind 숨김). 회귀: 37/39 PASS / 1 skip / 2 parallel flake (격리 시 모두 PASS).

- 2026-05-24 (Phase 10) — 다중 프레임 동시 드래그 이동. 사용자: "다중선택된 프레임들 같이 드래그로 이동되게 해줘". 처리: agocraft `createFrameMoveBinding` 의 `armed` 가 단일 `itemId/orig` 에서 `targets: ReadonlyArray<{itemId, orig, parent}>` + `primary: ItemId` 로 확장. pointerdown 시 vm.itemSelection 상태를 확인하고 multi 안에 pressed item 이 있으면 모든 multi 아이템의 originals 를 캡처 + 셀렉션 그대로 유지 (Figma parity). pressed item 이 multi 에 없으면 single 로 collapse. pointermove 시 same delta 를 모든 target 에 적용. (보너스) onPointerUp 의 합성 click 도 swallow — drag 후 합성된 click 이 frame body 의 onClick 으로 흘러 multi → single 로 collapse 하던 버그 해결. `@agocraft/editor@1.0.0-rc.20260524123936` publish. e2e: `apps/web/e2e/multi-drag.spec.ts` 2/2 PASS.

- 2026-05-24 (Phase 9) — Figma-style 마퀴 다중 선택 + Alt+drag 만 frame add. 사용자: "이제 드래그를 통한 다중선택기능을 만들고싶어 modifier키를 추천해줘" → "피그마와 동일하게 해주고 기존에 있던 다큐먼트이외의 빈영역을 드레그하면 자동으로 다큐먼트 추가를 하던 동작은 alt + 드래그만 남겨두고 제거하면 될거같아". 처리: (1) FrameStage `<RubberBandLayer requireAltKey>` → 평범한 드래그는 더 이상 add 트리거하지 않음. (2) 새 `MarqueeSelectionLayer` (apps/web/src/document/marquee/) — 호스트 엘리먼트의 capture-phase pointerdown + window-level pointermove/up 직접 구독 (router 의 lifecycle race 회피). 모디파이어 캡처: meta/ctrl → toggle, shift → add, 무 → replace. Alt held → 양보 (rubber-band 가 잡도록). (3) `useSelection` shim 에 `selectedIds: ReadonlySet<string>` + `selectFrames` / `addFrames` / `toggleFrames` mutation 추가 (vm.itemSelection 의 setMany/add/toggle 활용 — agocraft 의 Selection 은 이미 multi 지원). (4) `NestedFrame.isSelected` = `selectedIds.has(id)`, `isPrimarySelection` = `selectedId === id` 로 분리 — 모든 선택 frame 에 outline, primary 만 chrome handles / hotspot overlay. (5) `ContextualToolbar` 게이트: `selectedFrameId && !isMultiSelect`. (6) Synthesized-click swallow — pointerup 후 브라우저가 합성한 click 이 `handleBackgroundClick`(deselect)으로 bubble 하는 문제 해결 (window capture single-shot swallower). e2e: `apps/web/e2e/marquee-select.spec.ts` 5/5 PASS (replace · add · toggle · alt-add 회피 · 빈 영역 replace). 회귀: present-poc + item-primitives + history + media-src-dialog 등 25 PASS / 1 skip.

- 2026-05-24 (Phase 8) — Present mode 가 image/video/shape primitives 를 z-order 에 따라 렌더. 사용자 피드백: "다큐먼트 이외의 아이템들은 슬라이드 이동 대상은 아니지만 프레젠테이션 다큐먼트의 z-order에 따라 보이는 규칙에 맞게 프레젠테이션에서도 보여야해". 처리: (1) 새 `PresentFrameTree` recursive renderer — 각 camera-target scene 의 body 가 frame 의 own renderer + 모든 non-frame 자손 (image/video/shape) 을 ItemFrame ratio 0..1 로 absolute positioning 으로 렌더. nested frame 은 자기 scene 이 있으므로 skip. (2) root-level non-frame primitive (root → image/shape) 는 design-layer scene (id=`present-design-layer`) 에 묶어서 scenes 배열의 idx 0 에 prepend. Stage 의 dim 규칙 `idx > activeIdx` 가 activeIdx ≥ 1 (camera target) 일 때 design layer 를 dim 시키지 않도록 설계. (3) `FRAME_KINDS` set 을 `presentation-order.ts` 에서 export 하고 `document/index.ts` 에서 re-export — 같은 partition 을 PresentFrameTree 가 재사용. (4) `cameraTargets` 는 그대로 `effectivePresentationOrder` 기반 (frame_kinds only) — primitive 는 navigable 하지 않음 (← / → / 숫자 키로 jump 불가). e2e: `apps/web/e2e/present-primitives.spec.ts` 3/3 PASS (nested shape · root image · 빈 design layer). 회귀: present-poc 9/9 + 기존 18/19 = 31 PASS / 1 pre-existing skip.
- 2026-05-24 (Phase 7) — MediaSrcDialog 톤앤매너 정렬 + 로컬 파일 업로드. 사용자 피드백: "이미지 등록 팝업이 너무 톤앤매너도 안맞고 시인성도 안좋아 다른 메뉴들처럼 보이면 좋겠어 그리고 로컬 파일을 업로드해서 사용하는것도 필요해". 처리: (1) design-system `DialogContent` 에 `tone: "panel" | "overlay"` + `size: "sm" | "md" | "lg"` 변형 추가 (overlay 는 `--surface-overlay` glass — DropdownMenu / Popover 와 동일 톤). `DialogHeader` 에 `compact` prop + prop 명 `title → headline` (HTML title attribute 와 충돌 회피). (2) MediaSrcDialog 가 dropzone + hidden `<input type=file>` 추가 — 이미지는 `FileReader.readAsDataURL` 로 `data:` URL (round-trip safe), 비디오는 `URL.createObjectURL` 로 `blob:` URL (session-scoped). 6MB / 200MB 한도, mime guard. 업로드 활성 시 URL field 자동 disable + chip + 비우기. e2e: `apps/web/e2e/media-src-upload.spec.ts` 5/5 PASS (이미지 data:, 비디오 blob:, 비우기 복원, mime 거부, 도형 fill 도 파일로). 전체 회귀: media-src-dialog 5/5 + shape-media-fill 3/3 + item-primitives 4/4 + history-item-lifecycle 2/2 = 19/19 PASS. NewDesignWizard 의 `DialogHeader title=` → `headline=` 마이그레이션 동반.

## References

- HANDOFF-006 — `records/decision-handoffs/HANDOFF-006-item-primitives.md` (sender record)
- DR-014 — `records/decisions/DR-014-contextual-toolbar.md`
- DR-design-009 — `records/design-reviews/DR-design-009-contextual-toolbar-primitives.md`
- Feature folder: `features/item-primitives/ENGINEERING_PLAN.md`
- agocraft WI-015 — `workspace/agocraft/records/work-items/WI-015-item-primitives.md`
- agocraft DR-023 / DR-024 — schema source
- 관련 메모: [[feedback_design_system_triage_mandatory]], [[feedback_doc_mutation_must_hit_history]], [[feedback_backdrop_filter_under_transform]], [[feedback_radix_slot_wrapper_forwardref]], [[feedback_react_strictmode_singleton_dispose]]
