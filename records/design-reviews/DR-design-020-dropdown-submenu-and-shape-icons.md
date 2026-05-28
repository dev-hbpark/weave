# DR-design-020 — DropdownMenu sub-menu primitives + shape-variant icons

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-020 |
| Date | 2026-05-28 |
| Owner | hbpark |
| Component | `@weave/design-system` → `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` (3 new primitives, Radix wrappers) + 9 `IconShape*` glyphs (rectangle / ellipse / line / arrow / triangle / star / polygon / heart / speech-bubble) |
| Work item | [WI-044](../work-items/WI-044-quickaction-two-level-add-menu.md) — QuickActionBar two-level "+" add menu |
| Triage Decision | **Step 3 — Grew × 12** (3 menu primitives + 9 shape icons) |

## Triage Walk

| Item | Step | Outcome |
|---|---|---|
| `DropdownMenuSub*` | 3 Grew | ✅ — DropdownMenu 에 nested-flyout 프리미티브 부재 (grep `DropdownMenuSub` → 0 hit). ContextMenu 에는 이미 `ContextMenuSub/SubTrigger/SubContent` 존재 → 동형 패턴을 DropdownMenu 로 미러링. Radix 가 `Sub/SubTrigger/SubContent` 노출, 동일 Aurora-glass 토큰 적용. |
| 9 `IconShape*` | 3 Grew | ✅ — `Icon.tsx` 정적 glyph 집합에 9 SVG 추가. 동일 viewBox 24×24, stroke-only, currentColor, `baseProps`/`SvgRoot` 공유. 기존 inline 이모지 글리프(▭ ◯ ─ → △ ★ ⬡ ♥ 💬) 대체. |

| Step | Considered? | Result |
|---|---|---|
| 1. Reuse | ✓ | 평면 `DropdownMenuItem` 만으로는 "같은 kind, 다른 type" 2뎁스 표현 불가. shape 아이콘은 `IconShape`(단일 rounded square) 하나뿐 — 9 변형 구분 불가. |
| 2. Extend | ✓ | DropdownMenuItem 에 nested children 을 끼우는 것은 Radix roving-focus / 키보드 내비게이션을 깨뜨림 → 별 프리미티브가 정합. |
| 3. Grew | ✅ | ContextMenu 와 동일한, 검증된 Sub 패턴. 아이콘은 named const export 9개. |
| 4. Escape | ✗ | 두 surface(QuickActionBar, 추후 상단 툴바 add 메뉴) 모두 동일 shape 필요 — escape 보다 격상 정당. |

## Context

QuickActionBar 의 `+` 추가 메뉴(`FrameAddSubmenu`)가 평면 1뎁스였다. 사용자는 "추가 가능한 아이템 종류"를 1뎁스, "같은 종류의 타입 변형"을 2뎁스(호버 플라이아웃)로 보기를 원함:

- 프레임 → `absolute` / `flex` / `grid` (레이아웃 패러다임)
- 도형 → 사각형 / 원 / 선 / 화살표 / 삼각형 / 별 / 다각형 / 하트 / 말풍선
- 텍스트 / 이미지 / 비디오 → 타입 변형 없음 (1뎁스 직접 항목)

이를 위해 DropdownMenu 에 Sub 플라이아웃 프리미티브가 필요했고, 메뉴의 인라인 이모지 글리프를 아이콘으로 정리(이모지 금지 원칙)했다.

## Decision

### Sub-menu primitives (3 신규 in `DropdownMenu.tsx`)

```tsx
<DropdownMenuSub>
  <DropdownMenuSubTrigger icon={<IconFrame size={16} />} onClick={addDefault}>프레임</DropdownMenuSubTrigger>
  <DropdownMenuSubContent>{/* Absolute / Flex / Grid */}</DropdownMenuSubContent>
</DropdownMenuSub>
```

- ContextMenu 의 Sub 와 동일한 Aurora-glass 토큰 (`--surface-overlay`, `--surface-blur`, `--shadow-overlay`), `data-[highlighted]` / `data-[state=open]` 하이라이트, `data-[disabled]` opacity.
- **Indicator 는 `IconChevronRight`** (ContextMenu 의 인라인 `▸` 글리프 대신) — 이모지/텍스트 글리프 금지 원칙. ContextMenu 쪽은 점진 정리 대상.
- `DropdownMenuSubTrigger` 는 선택적 `icon` prop + `onClick` 패스스루(`...rest`) 지원: **호버 = 플라이아웃 열기, 직접 클릭 = 기본 변형 추가**(프레임=absolute, 도형=사각형). 이 dual 동작은 사용자 결정사항.
- `DropdownMenuSubContent` 는 `Portal` 로 렌더 → 호스트는 outer 메뉴의 200ms close 타이머가 플라이아웃 진입 시 닫지 않도록 SubContent 에 `onMouseEnter`/`onMouseLeave` 를 재부착해야 함(React portal 의 mouseleave 가 DOM 경계 기준이라 발생하는 함정).

### Shape-variant icons (9 신규 in `Icon.tsx`)

```tsx
<IconShapeRectangle /> <IconShapeEllipse /> <IconShapeLine /> <IconShapeArrow />
<IconShapeTriangle /> <IconShapeStar /> <IconShapePolygon /> <IconShapeHeart />
<IconShapeSpeechBubble />
```

- 모두 `SvgRoot` 패턴 (viewBox 24×24, stroke-only, currentColor, `baseProps` 공유).
- `ShapeSubKind` 의 9개 메뉴 제공 변형과 1:1 (union 의 `path` 는 메뉴 미제공 → 아이콘 없음).

### Tree-shake (DR-002 3 gates)

- ESM only / `sideEffects: false` (기존 package.json) / no reflect-metadata / named const export. 모두 충족.

### Bundle estimate

- Sub primitives: Radix `react-dropdown-menu` 의 Sub* 는 이미 의존성에 포함 (ContextMenu 가 동일 Radix 패키지의 Sub 사용) → 신규 런타임 dep 0. wrapper 코드 ~0.4 KB gz.
- 9 icons: ~0.7 KB gz combined.

## Out of scope (future PR)

- 상단 툴바 add 메뉴(`toolbar-add`)의 동일 2뎁스 전환 + 인라인 이모지(▭, T) 정리 — 같은 프리미티브로 후속.
- ContextMenu 의 `▸` indicator → `IconChevronRight` 정리.
- 이미지/비디오 2뎁스(소스 종류 선택 등) — 현재는 미디어 다이얼로그로 위임.

## Verification

- typecheck (design-system + web): PASS
- declarativecheck (Rule 6): PASS
- build: PASS
- e2e `figma-quickaction-add.spec.ts`: 14/14 PASS — 프레임→Flex(auto-flex), 프레임→Grid(auto-grid), 도형→원(ellipse), 이미지→미디어 다이얼로그 런타임 검증 포함.

## Review-by

- `design-system-agent` — primitive promotion + Sub 패턴 일관성
- `frontend-architecture-agent` — portal mouseleave 함정 + 키보드 내비게이션

## Status

**Decided & implemented 2026-05-28.** Lands in the same commit as WI-044.
