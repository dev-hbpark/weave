# WI-027 — Hover Affordance via CommandMetadata.visibleWhen

## Metadata

| Field | Value |
|---|---|
| ID | WI-027 |
| Status | **Phase A~D Complete** — agocraft visibleIn + weave useHoverContext + design-system QuickActionBar + 4 hover commands |
| Date opened | 2026-05-25 |
| Trigger | 사용자 — "마우스 호버 시 호버된 영역에서 할 수 있는 일들을 유지보수 비용 없이 관리" 가능성 검토 후 "옵션 B (Figma 스타일 quick-action bar) + agocraft 정석" 확정 |
| Cross-references | [WI-026 CommandMetadata SSOT](WI-026-command-metadata.md), OS Rule 6, AUDIT-002 |

## 1. 동기

WI-026 가 만든 CommandMetadata SSOT 위에서 한 단계 더: **사용자가 마우스로 호버한 영역에 대한 가능한 동작들이 자동으로 UI 에 등장**. 새 명령을 추가할 때 호버 컨텍스트만 `visibleWhen` 으로 선언하면 별도 UI 코드 수정 0건으로 affordance 에 자동 등장.

VSCode 의 hover provider + Figma 의 frame quick-action bar 패턴.

## 2. 적용 완료 단계

### Phase A ✅ — agocraft `visibleWhen` 필드 + `listVisible` 메서드

`packages/core/src/command/metadata.ts`:
- `VisibleWhenFn = (ctx: EnabledWhenContext) => boolean` 타입
- `CommandMetadata.visibleWhen?: VisibleWhenFn` 옵션 필드
- `CommandMetadataRegistry.listVisible(ctx): ReadonlyArray<CommandMetadata>` — visibleWhen 매치되는 모든 명령 (정렬됨)
- **opt-in by design** — visibleWhen 없는 명령 은 affordance 에 절대 노출 안 됨 (글로벌 명령은 palette/메뉴 전용)

신규 vitest 1건 — visibleWhen 매칭 / globalcommand 제외 / 빈 ctx 처리.

검증: agocraft `pnpm verify` GREEN (311 tests).

### Phase B ✅ — weave `useHoverContext` hook

`apps/web/src/document/interactions/use-hover-context.ts` (130L):
- DOM event delegation — host element 의 `pointermove` / `pointerleave` 1쌍만 listen
- `data-frame-kind` / `data-frame-id` / `data-shape-id` / `data-hotspot-id` / `data-handle-kind` / `data-textbox-id` closest() probe
- HoverContext = `{ hoveredKind, hoveredId, hoveredRole }`
- dedup: kind/id/role 모두 동일하면 setState 호출 안 함 → 재렌더 없음

`FrameStage.tsx`: `data-frame-kind={kind}` 추가하여 도메인 kind (image/video/shape/text) 가 hover context 에 흐름.

### Phase C ✅ — `<QuickActionBar>` (design-system)

`packages/design-system/src/components/QuickActionBar.tsx` (100L):
- `useCommandHostOrNull()` → registry.listVisible(context) 호출
- `category` 필터 + `maxItems` 캡
- `renderItem(id): ReactNode` — host 가 icon mapping 결정 (도메인 분리)
- structural `CommandRegistryLike` 에 `listVisible?` 옵션 메서드 추가 (older registry 호환)

### Phase D ✅ — 4 hover-scope commands + host slot 등록 + bar mount

EDITOR_COMMANDS 신규 entries (`editor-hotkeys.ts`):
- `frame.duplicate` — visibleWhen: frame/image/video/shape/text hover
- `frame.delete` — 동일
- `image.replaceSrc` — image hover only
- `video.replaceSrc` — video hover only

Host action slots (`setFrameDuplicator` / `setFrameDeleter` / `setMediaSrcOpener`) — module-level 슬롯에 DesignPage 가 closure 등록. dispatchEditorCommand 가 `tryHostSlot()` 먼저 시도 후 fallback.

`DesignPage.tsx`:
- `useHoverContext(canvasHostRef)` 호출
- `commandContext` 에 `hoveredKind / hoveredId / hoveredRole` 키 추가
- `dispatchCommand(id)` 가 hoverContext 도 3번째 인자로 전달
- 3 useEffect 로 host slot 등록
- 화면 우상단 `<div fixed>` 안에 `<QuickActionBar renderItem={...} />` mount

## 3. 자동 적용 시나리오 검증

| 변경 | 자동 따라가는 곳 |
|---|---|
| 새 명령 + `visibleWhen: ctx => ctx.hoveredKind === "image"` | image hover 시 QuickActionBar 자동 등장. DesignPage / FrameStage 수정 0 |
| `frame.duplicate.label.ko` 변경 | bar 의 aria-label / title / data-testid 자동 갱신 |
| `frame.delete.enabledWhen` 조건 강화 | 매치 안 되면 회색 처리 |
| 새 hover 영역 추가 (data-* 새 속성) | useHoverContext 의 PROBES 한 줄 추가 → 해당 영역 명령 자동 등장 |
| palette (Cmd+K) 의 fuzzy 검색 | visibleWhen 없는 글로벌 명령도 검색 가능 (palette 는 list() 사용, hover bar 는 listVisible() 사용) |

## 4. 검증

- agocraft `pnpm verify` GREEN (311 tests)
- weave `tsc + vite build` GREEN (bundle 768 KB / 240 KB gzip, +0 vs WI-026 — QuickActionBar 가 tree-shake 후 적은 추가)

## 5. 향후 확장

- **B 옵션 high-fidelity**: 현재는 화면 우상단 fixed bar — Figma 처럼 hovered frame 의 우상단 floating 으로 위치 (BoundingClientRect + camera transform)
- **inline keycap chips (옵션 C)**: ⌘D / DEL chip 을 hovered frame 위에 fade-in
- **`hover.fitToFrame` / `shape.changeKind` / `image.fitMode.toggle`** 등 추가 명령 — visibleWhen 한 줄로 박제
- **selection-scope visibility**: 단일 선택 시 + hover 안 함 시 selection chrome 옆 quick-bar — `useSelection` + `useHoverContext` 결합
- **palette 의 첫 결과를 hover 컨텍스트와 일치하는 명령으로 부스트** — palette `category: "hover"` 별 boost

## 6. 변경 이력

- 2026-05-25 — Phase A~D 완료. agocraft 1.0.0-rc.20260525024817 (재벤더). WI-027 발행.
