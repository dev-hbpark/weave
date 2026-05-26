# Design Review — DR-design-011

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-011 |
| Title | ContextMenu sub-primitives parity with DropdownMenu — Label, Group, item icon/tagline slots |
| Triggering Work Item | WI-033 (Figma frame UX adoption — A4 Layer Picker) |
| Triage outcome | **Extended (step 2)** — promote two Radix sub-primitives + add two optional slots on an existing item |
| Status | **Accepted** (`design-system-agent` sign-off 2026-05-26 + hbpark) |
| Owner | hbpark |
| Reviewer(s) | `design-system-agent` (CONDITIONAL APPROVAL — A4 Layer Picker triage), hbpark |
| Date | 2026-05-26 |
| Supersedes | DR-design-005 §10 의 open question ("`tagline` / `shortcut` slot 비대칭… 향후 통일 가능") — **closed by 본 record** |

## 1. Change in one sentence

`@weave/design-system` 의 **ContextMenu** wrapper 에 **`ContextMenuLabel`** + **`ContextMenuGroup`** export 추가 + **`ContextMenuItem`** 의 prop interface 에 optional **`icon`** + **`tagline`** slot 추가 — 즉 기존 **DropdownMenu** wrapper 가 이미 가진 sub-primitive parity 를 ContextMenu 쪽에 맞춤. 시각 contract / token / motion 변경 0.

## 2. Why

- **User problem (직접 trigger)**: WI-033 의 A4 Right-click Layer Picker 가 ContextMenu 안에 "Select layer" section header + overlapping items list + 구분선 + 기존 Delete 항목 의 합성 surface 를 요구. section header 와 explicit group 이 현 ContextMenu wrapper 에 없음.
- **Why existing primitives 불충분**: Radix `react-context-menu` 본체에는 `Label` 과 `Group` 이 존재. 그러나 `@weave/design-system/ContextMenu.tsx` wrapper 는 그것들을 export 하지 않음. 동시에 sibling wrapper `DropdownMenu.tsx` 는 `DropdownMenuLabel` 을 이미 export 하고 item 에 `icon` + `tagline` slot 도 가짐. **wrapper 간 asymmetry**.
- **DR-design-005 §10 의 open question**: *"`tagline` / `shortcut` slot 비대칭… 향후 통일 가능"* — 그 open 을 본 record 가 close.
- **Variant explosion 방지 (사용자 명시 의무)**: A4 Layer Picker 를 별 primitive (`LayerPickerMenu` 같은) 로 design system 안에 박제하면 **두 menu 시각 contract 가 competing** — hover state / focus ring / motion / padding 의 drift 가 시간에 따라 발생. ContextMenu 의 parity 를 한 번 닫고, Layer Picker 는 **app-local composition** 으로 처리하는 것이 정통.

## 3. Triage decision tree walk

- **Reused?** Almost — `ContextMenu`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator` 가 ~80% cover. Missing = section header + explicit group.
- **Extended an existing primitive?** **YES** — Radix 본체에 이미 존재하는 `Label` / `Group` 을 wrapper 에서 promote + `ContextMenuItem` 에 sibling `DropdownMenuItem` 의 `icon` / `tagline` slot parity. **새 visual language 0, 새 token 0, 새 motion contract 0**. 본 정통.
- **Grew (new primitive)?** **NO** — `LayerPickerMenu` 를 design-system primitive 로 박제하면 ContextMenu 와 visual contract competing → variant explosion. Hard block.
- **Escape hatch?** **NO** — inline 구현은 ContextMenu surface 의 tokenize 효용 (DR-design-005 의 cost) 을 무효화.

## 4. API shape

### ContextMenuLabel (신규 export)

```ts
export function ContextMenuLabel({ className, children }: {
  readonly className?: string;
  readonly children: ReactNode;
}): JSX.Element;
```

`ContextMenuPrimitive.Label` 의 thin wrapper. Style = `DropdownMenuLabel` 과 동일 token (`--text-overlay-soft` + uppercase tracking 0.16em + 11px font-size + px-2.5 py-1.5).

### ContextMenuGroup (신규 export)

```ts
export function ContextMenuGroup({ className, children, ...props }: {
  readonly className?: string;
  readonly children: ReactNode;
  readonly "aria-label"?: string;
}): JSX.Element;
```

`ContextMenuPrimitive.Group` 의 thin wrapper. `aria-label` 을 pass-through 하여 screen reader 가 group 진입 시 announce.

### ContextMenuItem (slot 추가)

기존:
```ts
interface ContextMenuItemProps extends ContextMenuPrimitive.ContextMenuItemProps {
  readonly variant?: "default" | "danger";
  readonly shortcut?: ReactNode;
}
```

확장:
```ts
interface ContextMenuItemProps extends ContextMenuPrimitive.ContextMenuItemProps {
  readonly variant?: "default" | "danger";
  readonly shortcut?: ReactNode;
  readonly icon?: ReactNode;       // NEW — DropdownMenuItem parity
  readonly tagline?: ReactNode;    // NEW — DropdownMenuItem parity
}
```

`icon` / `tagline` 모두 optional. **undefined 시 기존 rendering 과 동일** — backward compat 보장.

Layout 변경 (when `tagline` set): `DropdownMenuItem` 와 동일하게 `flex-1 grid` 의 inner column (label + tagline stacked). 기존 `items-center justify-between` 은 `tagline` undefined 시 그대로.

Icon: `aria-hidden` 강제 (purely decorative). 의미 정보는 label 이 담당.

## 5. Tokens used

- `--text-overlay-soft` (label uppercase, DR-design-005 §5 이미 사용)
- `--text-overlay`, `--text-overlay-muted` (item label / tagline)
- `--surface-overlay`, `--surface-overlay-border`, `--surface-overlay-2`, `--surface-blur`, `--shadow-overlay` (menu surface — ContextMenuContent 가 이미 사용)
- `--radius-sm`, `--radius-md` (item / content radii)
- `--focus-ring` (Radix `data-[highlighted]`)
- `--accent-strong`, `--accent-soft` (danger variant — 기존)
- `--motion-fast` (ContextMenuContent 의 `animate-in fade-in`)

**새 token 0**. DR-design-001 + DR-design-005 의 token surface 그대로.

## 6. Accessibility

- **`ContextMenuLabel`** — Radix 가 non-focusable static label 으로 wrap. screen reader skip OK (visible heading 으로 인식되지만 menuitem 으로 인식 안 됨).
- **`ContextMenuGroup`** — `role="group"` (Radix), `aria-label` pass-through. SR 가 arrow-key 로 group 진입 시 announce.
- **Icon `aria-hidden`** — purely decorative. label 이 의미 정보 담당.
- **`tagline`** — visible-only metadata (size / position info). SR 가 menuitem 의 accessible name 의 일부로 인식 (visible text 포함).
- **focus ring** — `--focus-ring` token. Radix `data-[highlighted]` 가 keyboard nav 시 자동 paint. WCAG AA contrast 3 theme 모두 만족 (DR-design-001 의 token verification).

## 7. Three-theme consistency

| Token | Aurora | Vivid | Midnight |
|---|---|---|---|
| `--surface-overlay` (menu bg) | dark glass | solid dark | very dark |
| `--surface-overlay-2` (item hover) | brighter step | brighter step | brighter step |
| `--text-overlay` / `--text-overlay-soft` / `--text-overlay-muted` | high contrast | high contrast | inverted high contrast |
| `--accent-strong` / `--accent-soft` (Delete danger) | aurora | vivid | midnight |
| `--focus-ring` | aurora gradient | vivid gradient | midnight gradient |

**3 theme 모두 verified** (DropdownMenuLabel 이 이미 같은 token 사용 — 동작 동일).

## 8. Consequences

### Breaking changes
- 없음. `icon` / `tagline` slot 은 optional → 기존 모든 caller backward-compat.

### 즉시 변화
- `packages/design-system/src/components/ContextMenu.tsx` — +2 export, +2 slot. 약 35-45 LOC.
- `packages/design-system/src/components/index.ts` — re-export `ContextMenuLabel`, `ContextMenuGroup`.
- 본 record 박제 완료.

### 사용처 (initial)
- `apps/web/src/document/layer-picker/LayerPickerMenu.tsx` (WI-033 P1 A4) — `ContextMenuLabel` + `ContextMenuGroup` + `ContextMenuItem.icon/tagline` 모두 사용.
- 향후 `KindTooltip` / `FrameContextMenu` 도 `tagline` slot 사용 가능 (v1.x).

### Risk
- **Variant explosion risk = 0** — 같은 `ContextMenuItem` primitive, slot 만 추가. 사용처에서 시각 drift 0.
- **Visual regression risk = 낮음** — 기존 `ContextMenuItem` rendering 은 slot undefined 시 변경 없음. `FrameContextMenu` 의 Delete 항목 등 변동 0. visual snapshot e2e (Phase 1) 로 검증.

## 9. Verification

- [ ] **Visual snapshot**: 기존 `FrameContextMenu` (Enter frame + Delete) 의 screenshot 이 main branch 와 pixel diff 0.
- [ ] **Visual snapshot**: `KindTooltip` (있다면) 변동 0.
- [ ] **Aurora / Vivid / Midnight 3 theme** smoke — 새 `ContextMenuLabel` + `Group` 의 시각 일관성.
- [ ] **prefers-reduced-motion** 검증 — menu 진입 transition 즉시 swap.
- [ ] **Bundle delta** ≤ +1 KB gz — `react-context-menu` 본체 이미 loaded, 추가 export 만.
- [ ] **a11y**: `ContextMenuGroup aria-label="Select layer"` 가 SR 에 정상 announce.

## 10. Out of scope

- `LayerPickerMenu` 자체의 구현 — app-local composition, 본 DR 의 범위 외. WI-033 P1 A4 build 에서 별 진행.
- Submenu / nested context menu — v1 unused. 추가 시 별 DR.
- `aria-live` hover preview — v1.x a11y polish.

## 11. Links

- Triggering Work Item: WI-033
- Pairs with: DR-017 (Figma selection model), Engineering Plan §3.4 / Appendix A
- Supersedes (closes): DR-design-005 §10 의 open question
- Related primitive: `DropdownMenu` (parity reference — `DropdownMenuLabel` / `DropdownMenuItem.icon/tagline`)
- Future consumer: `apps/web/src/document/layer-picker/LayerPickerMenu.tsx` (WI-033 P1 A4)
- Design tokens reference: DR-design-001
