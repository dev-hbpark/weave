# WI-044 — QuickActionBar two-level "+" add menu (item kind × type variant)

## Metadata

| Field | Value |
|---|---|
| ID | WI-044 |
| Title | QuickActionBar 의 `+` 추가 메뉴를 2뎁스로 — 1뎁스 = 아이템 종류(프레임/텍스트/이미지/비디오/도형), 2뎁스 = 같은 종류의 타입 변형(프레임 layout 패러다임, 도형 변형) |
| Owner | hbpark |
| Status | **Implemented & verified green (2026-05-28).** typecheck(DS+web) / declarativecheck / build / 212 unit / 14 e2e (`figma-quickaction-add.spec.ts`) 전부 PASS. |
| Severity | P2 (LG-001 영향 0, UX 개선) |
| Created | 2026-05-28 |
| Closed | 2026-05-28 |
| Related | [WI-027](WI-027-hover-affordance.md) (QuickActionBar 도입), [WI-043](WI-043-frame-layout-ux.md) (frame layout UX — flex/grid spec 출처), [DR-design-020](../design-reviews/DR-design-020-dropdown-submenu-and-shape-icons.md) (design-system grow) |

## Summary

**현재 상태(변경 전)**: 선택된 프레임 위 QuickActionBar 의 `+` 버튼 호버 → 평면 1뎁스 메뉴(`FrameAddSubmenu`)가 프레임 / 텍스트 / 도형 9종을 한 목록에 나열. 이미지·비디오는 메뉴에 없었고, 모든 항목 글리프가 인라인 이모지(▢ T ▭ ◯ ─ → △ ★ ⬡ ♥ 💬)였다(이모지 금지 원칙 위반).

**원하는 변화(사용자 요청)**: "추가 가능한 각각의 아이템"을 1뎁스로, "아이템 종류는 같지만 타입이 다른 것"을 2뎁스(호버 플라이아웃)로.
- 1뎁스: 프레임 · 텍스트 · 이미지 · 비디오 · 도형 (5종, 사용자 확정)
- 2뎁스: 프레임 → `absolute` / `flex` / `grid`; 도형 → 사각형 / 원 / 선 / 화살표 / 삼각형 / 별 / 다각형 / 하트 / 말풍선

## Product decisions (사용자 확정 2026-05-28)

1. **1뎁스 = 5종** (프레임·텍스트·이미지·비디오·도형). 기존 텍스트 유지 + 이미지·비디오 신규 노출.
2. **프레임 직접 클릭 = 기본(absolute) 프레임 즉시 추가**, 호버 = flex/grid 플라이아웃. (도형도 동형: 클릭=사각형, 호버=변형)
3. **이미지·비디오 1뎁스 선택 = 미디어 URL/선택 다이얼로그 열기** (기존 상단 툴바와 동일 경로). 직접 삽입 아님.

## Changes

### Design system (`@weave/design-system`) — DR-design-020

- `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` 신규 (Radix 래퍼, ContextMenu Sub 패턴 미러링). Indicator 는 `IconChevronRight`(이모지 `▸` 아님). SubTrigger 는 `icon` prop + `onClick` 패스스루 지원(호버=플라이아웃, 클릭=기본 변형).
- 9 `IconShape*` 글리프 신규 (rectangle/ellipse/line/arrow/triangle/star/polygon/heart/speech-bubble).

### Host (`apps/web/src/pages/DesignPage.tsx`)

- `FrameAddSubmenu` 재작성: 1뎁스 5항목 + 프레임/도형 2뎁스 플라이아웃. 전 항목 아이콘화(이모지 0). SubContent 에 `onMouseEnter`/`onMouseLeave` 재부착 — portal 의 mouseleave 가 outer 메뉴의 200ms close 타이머를 트리거하는 함정 회피.
- `onInsert` / `onInsertInFrame` 계약 확장: `(containerId, kind, options?: { shapeSubKind?, frameLayout? })`.
- 호스트 핸들러 라우팅: image/video → `setPendingMedia({action:"add"})`; frame flex/grid → **생성 시점 `attrsOverride.layout`** 로 spec 부착(아래 함정 참조); shape 변형 → `attrsOverride.shape`/`subAttrs`.

## Pitfall 박제 (runtime-wire 검증으로 발견)

- 첫 구현은 `weave.item.add` 후 follow-up `weave.frame.setLayout` 을 exec → **layout 미적용**. 원인: `weave.item.add` 가 `PendingCreations` 로 새 아이템을 staging → 같은 tick 의 `setLayout` 의 `findChild(ctx.document, id)` 가 아직 못 찾음(silent fail). 이미 `addNewItem` 주석이 경고하던 race.
- **해결**: 새 프레임은 자식이 없으므로 re-place 불필요 → 생성 시점 `attrsOverride.layout = spec` 로 직접 부착(shape sub-kind 와 동일 패턴). `weave.item.add` 는 `{...attrs, ...attrsOverride}` 제네릭 머지(commands.ts:263)라 임의 key 통과. 자식이 추가되면 onChildAdd 훅이 배치 담당.
- 이 버그는 typecheck/build 로는 안 잡히고 **e2e 에서 새 자식의 `attrs.layout.kind` 단언으로만 검출** — Continuous Self-Verification 가치 재확인.

## Verification

- typecheck (design-system + web): PASS
- declarativecheck (Rule 6) / puritycheck: PASS / N/A
- build: PASS
- unit: 212/212 (web), design-system unit 없음
- e2e `figma-quickaction-add.spec.ts`: **14/14 PASS** — 신규 4 케이스(프레임→Flex=auto-flex, 프레임→Grid=auto-grid, 도형→원=ellipse, 이미지→media-src-dialog) + 기존 10 회귀 0.
- lint(biome): 비차단 게이트(레포 기존 177 에러 baseline). 본 변경 신규 lint 부채 0 (unused import/var HEAD=working 동일).

## Out of scope (future)

- 상단 툴바 add 메뉴(`toolbar-add`) 동일 2뎁스 전환 + 인라인 이모지(▭, T) 정리.
- ContextMenu 의 `▸` indicator → `IconChevronRight` 정리.
- 이미지/비디오 2뎁스(소스 종류) — 현재 미디어 다이얼로그 위임.
