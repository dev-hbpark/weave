# Design Review — DR-design-005

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-005 |
| Title | Editor chrome primitives — Dialog · RadioTile · TextField · Toolbar · ContextMenu · DropdownMenu · IconButton |
| Triggering Work Item | Phase 9 "create a new design" flow (WI-013 후속) |
| Triage outcome | **Grew (new primitives)** — step 3 of design-system-triage decision tree |
| Status | **Accepted** (hbpark sign-off 2026-05-23) |
| Owner | hbpark |
| Reviewer(s) | `design-system-agent` (auto via triage), hbpark |
| Date | 2026-05-23 |

## 1. Change in one sentence

`@weave/design-system` 에 editor chrome 7 primitive 추가 — **Dialog** (Radix wrapper, modal new-design wizard), **RadioTile / RadioTileGroup** (visual radio for flavor + size 선택), **TextField / FieldGroup** (labelled text/number input), **Toolbar / ToolbarDivider** (horizontal control group), **ContextMenu** (Radix wrapper, right-click on items), **DropdownMenu** (Radix wrapper, toolbar Add menu), **IconButton** (square icon-only button).

## 2. Why

- **User problem**: "데모 페이지를 실제로 새로운 디자인을 만드는 단계부터 진행" — onboarding flow (type + size 선택) + 편집 단계 (toolbar / 선택 UX / context menu) 가 필요. 사용자 명시 (2026-05-23).
- **Why existing primitives 불충분**: 기존 Card / Button / EditableText / SelectionLayer 만으로는 (a) modal capture (b) right-click menu (c) toolbar 의 grouped control 표현 불가.
- **Why now**: 사용자가 명시적으로 "디자인 시스템을 잘 활용해야해" 라고 못 박음 — demo page 안에서 inline lookalike 로 hack 하지 않도록 design system 측에 박제할 의무가 발생.

## 3. Triage decision tree walk

- **Reused?** No — modal / context menu / dropdown / toolbar 는 기존 primitive 으로 표현 불가.
- **Extended an existing primitive?** No — `Button` 의 size/variant 를 늘려서 IconButton 표현은 가능하나, square fixed aspect ratio · icon-only a11y label 강제 같은 contract 가 기존 `Button` 의 다른 사용 (text content, asChild Link slot) 과 충돌. **별 primitive 박제**가 깔끔.
- **Grew (new primitive)?** YES — 7 개 모두 새 surface 의 박제.
- **Escape hatch?** No — 일관 사용을 위해 design system 안에 박제할 의무.

## 4. API shapes

### Dialog

Radix `react-dialog` 의 thin wrapper. `Dialog.Root`, `Dialog.Trigger`, `Dialog.Close`, `DialogContent` (motion entrance + aurora-glass surface), `DialogHeader` (title + description), `DialogFooter` (right-aligned actions).

### RadioTile / RadioTileGroup

Radix `react-radio-group` 의 wrapper. Visual tile (icon + title + tagline) — `data-[state=checked]` 시 accent 강조. `cols` 로 2/3/4 grid layout. `title` 은 ReactNode (Radix 의 default string `title` 회피를 위해 `Omit` 처리).

### TextField / FieldGroup

Native `<input>` wrapper — label / hint / errorText slot. `<fieldset>` 으로 grouping (legend + description) — form a11y 호환.

### Toolbar / ToolbarDivider

Flex container with aurora-glass surface, `role="toolbar"`. Divider 는 1px subtle separator. 내부에 IconButton / Button / DropdownMenu 등을 표준 mix.

### ContextMenu

Radix `react-context-menu` 의 wrapper. `ContextMenuTrigger` (`asChild`), `ContextMenuContent` (portaled menu surface), `ContextMenuItem` (variant `default` / `danger`, optional shortcut), `ContextMenuSeparator`. Item 의 right-click 에서 발사.

### DropdownMenu

Radix `react-dropdown-menu` 의 wrapper. ContextMenu 와 통일된 menu visual surface — `DropdownMenuItem` 에 icon / tagline / shortcut slot. Toolbar 의 "+ Add" 에서 발사.

### IconButton

`button` + `aria-label` 강제. sizing (sm/md), variant (ghost / subtle / danger), focus-visible ring 의무. children 은 icon (string emoji / SVG).

## 5. Tokens used

- Surface: `--surface-1`, `--surface-1-border`, `--surface-2`, `--surface-2-border`
- Backdrop: `--surface-blur` (Aurora glass)
- Accent: `--accent`, `--accent-soft`, `--accent-strong`, `--accent-gradient`
- Text: `--text-strong`, `--text-default`, `--text-soft`, `--text-muted`
- Border: `--surface-1-border`, `--border-strong`
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`
- Shadow: `--shadow-glow`, `--focus-ring`
- Motion: `--motion-fast`, `--motion-normal`, `--motion-spring-soft`

(All from DR-design-001 / aurora-glass tokens. No new tokens added.)

## 6. Accessibility

- **Dialog** — Radix manages `aria-labelledby` (via `DialogPrimitive.Title`), `aria-describedby` (via `DialogPrimitive.Description`), focus trap, Escape close, click-outside dismiss.
- **RadioGroup** — Radix arrow-key navigation, `aria-checked` per tile.
- **TextField** — `<label>` for + `htmlFor`, `aria-describedby` for hint/error, `aria-invalid` when errorText.
- **Toolbar** — `role="toolbar"`, focusable children (IconButton, Button).
- **ContextMenu / DropdownMenu** — Radix keyboard nav (↑↓, Home, End, type-ahead), Escape close, focus management on open/close.
- **IconButton** — `aria-label` required prop (compile-time enforce).

## 7. Theme compatibility

| Theme | Surface | Border | Text | Result |
|---|---|---|---|---|
| Aurora | aurora-glass (low alpha) | translucent | high contrast | ✓ |
| Vivid | solid surfaces | stronger | high contrast | ✓ |
| Midnight | dark surfaces | subtle | inverted | ✓ |

All primitives use `var(...)` tokens — theme 교체 시 자동 적용.

## 8. Tests

- e2e: `apps/web/e2e/new-design.spec.ts` (2 tests) — wizard open → fill → create → editor; toolbar Add → block 추가 → undo/redo → drill into sub-doc.
- Existing e2e regression: 20/20 PASS — slide/doc/media/canvas inline edits, shape drag, history hotkeys, etc.

## 9. Trade-offs accepted

- **Radix dependency growth** — 4 개 신규 package 추가 (`react-dialog`, `react-radio-group`, `react-context-menu`, `react-dropdown-menu`). 총 ~80KB gzip 정도 추가. 자체 hand-build 의 a11y 부담 회피와의 trade.
- **`tagline` / `shortcut` slot 비대칭** — DropdownMenuItem 은 (icon / tagline / shortcut) 셋 다 지원, ContextMenuItem 은 shortcut 만 지원. 향후 통일 가능.

## 10. Open questions

- ColorTile (canvas shape hue picker) — 다음 라운드에 추가
- Tooltip (toolbar hover hints) — next round
- Slider (size custom width/height 을 slider 로도) — defer
