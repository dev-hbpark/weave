# HANDOFF-007 (FROM agocraft) — layout variants expansion v1.1 (auto-flex + auto-grid) inbound

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-007 (weave inbox) |
| Direction | agocraft (sister, `workspace/agocraft/`) → **weave (this project)** |
| Sender | agocraft (sister) |
| Target | weave (this project) |
| Date sent | 2026-05-28 |
| Severity | P2 (LG-001 영향 0 — agocraft 1.1.0-rc publish 가 weave LG-001 의 이후) |
| Status | **planned outbound** (agocraft B6 publish 후 status flip to "active"). Discovery only — agocraft 측 Discovery + Feasibility + Risk + Plan 박제 완료, Build 별도 세션 |
| Originating | agocraft [WI-020](../../../agocraft/records/work-items/WI-020-layout-variants-expansion.md), [FR-009](../../../agocraft/records/feasibility-reviews/FR-009-layout-variants-expansion.md), [RISK-002](../../../agocraft/records/risks/RISK-002-layout-variants-expansion.md), [ENGINEERING_PLAN](../../../agocraft/features/layout-variants-expansion/ENGINEERING_PLAN.md) |
| weave WI | [WI-043](../work-items/WI-043-frame-layout-ux.md) |
| Vendor pin | `1.1.0-rc.<TBD>` — agocraft B6 시점 publish (WI-019 1.0.0 close 후) |

---

## 1. Inbound 요약 (agocraft → weave)

agocraft v1.1 (auto-flex + auto-grid LayoutKind variant + 2 adapter) 가 publish 되면 weave 가 다음 surface 를 받는다:

```ts
// @agocraft/core/layout — additive union 확장
export type LayoutKind = "absolute-constraints" | "auto-flex" | "auto-grid";

export interface AutoFlexSpec { kind: "auto-flex"; direction; gap; justify; align; padding; }
export interface AutoFlexChildPolicy { kind: "auto-flex"; grow; shrink; basis; alignSelf?; }
export interface AutoGridSpec { kind: "auto-grid"; columns: TrackSize[]; rows; columnGap; rowGap; justify; align; padding; }
export interface AutoGridChildPolicy { kind: "auto-grid"; column; columnSpan; row; rowSpan; alignSelf?; justifySelf?; }
export type TrackSize = { kind: "ratio"; value } | { kind: "fr"; value } | { kind: "auto" };

// @agocraft/layout — 2 adapter 추가
export { createAutoFlexAdapter, createAutoGridAdapter };

// sub-path (tsup multi-entry, RISK-002 C3.1)
// import { createAutoFlexAdapter } from "@agocraft/layout/auto-flex"
// import { createAutoGridAdapter } from "@agocraft/layout/auto-grid"
```

기존 `item.layout` / `item.layoutChild` Patch variant 는 union 의 union 으로 자동 cover — Patch 코드 변경 0.

Schema version: 10 → 11 (additive, migration helper 불필요).

CHANGELOG: MINOR (additive). breaking 0.

---

## 2. weave 측 응답 의무 (RISK-002 14 control 의 weave 측 매핑)

| RISK-002 ID | weave 책임 | WI-043 phase | Priority |
|---|---|---|---|
| **C2.1** | layout type SegmentedControl helper text (Flex/Grid 의 제외 항목 명시) | B3 | P0 |
| **C2.2** | "agocraft Flex vs Figma Auto Layout vs CSS Flexbox 차이표" docs | B5 (post-LG) | P1 |
| **C2.3** | layout 변경 command 에 cubic-bezier symmetric motion | B3 | P0 |
| **C2.4** | `IconLayoutAbsolute` / `IconLayoutFlex` / `IconLayoutGrid` design-system 신규 + DR-design | B2 의 pre-step | P0 |
| **C3.2** | size-diff CI gate 가 sub-paths import 변화 detect (host wire 안 하면 byte 0) | B1 + B5 | P0 |
| **C3.4** | publish 순서 박제 — agocraft 1.0.0 → weave LG-001 → agocraft 1.1.0-rc → weave WI-043 → LG | B1 | P0 |
| **C3.5** | rollback plan — vendor 1.0.x downgrade path | B5 | P1 |
| **C4.1** | layout type SegmentedControl `aria-label` 사용자 의도 텍스트 | B3 | P0 |
| **C4.2** | PropertiesPanel 신규 field 가 design-system Field/Label/Description primitive | B4 | P0 |
| **C4.3** | layout type 변경 시 live region announcement | B3 | P0 |
| **C4.4** | Option+drag popup layout type item 이 기존 RecommendationPopover ARIA 재사용 | B2 | P0 |
| **C4.5** | axe-core + screen reader smoke e2e (layout type 변경 announcement) | B5 | P0 |

agocraft 측 책임 (weave 가 의존만):
- **C1.1-C1.4** — CHANGELOG / LAYOUT_KINDS closed / semver minor / SDK type narrowing docs
- **C3.1** — tsup multi-entry sub-path
- **C3.3** — TrackSize array CRDT determinism (WI-028 resume self-test)
- **C5.1** — PoC bundle 결과 가 H4 미달 시 library-adoption-review trigger

---

## 3. Vendor adoption (weave B1)

1. agocraft B6 의 `pnpm pack` 결과 14 tgz 가 `apps/web/vendor/agocraft/` 에 들어옴 (1.1.0-rc.<timestamp>)
2. `apps/web/scripts/repack-vendor.sh` 실행 — `package.json` 의 `@agocraft/*` dependency 가 새 tgz path 로 갱신
3. `pnpm install --filter @weave/web`
4. `pnpm typecheck` — additive only 라 통과 보장 (단, `LayoutKind` 의 exhaustive switch 가 있으면 컴파일 에러 → 좋음, 명시적 default 추가)
5. `pnpm test` — 기존 e2e 회귀 0 확인

---

## 4. weave 의 신규 surface (WI-043 § Scope)

`apps/web/src/document/`:
- `insertable/design-root.insertable.ts` — A3 layout type toggle (Absolute / Flex / Grid)
- `toolbar/sections/frame-background-section.tsx` — layout SegmentedControl 추가
- `commands.ts` — `weave.frame.setLayout` + `weave.item.setLayoutChild` 확장 + `weave.item.add` optional `layout` input
- `layout/registry.ts` — `WI020_LAYOUT_VARIANTS_ENABLED` flag + auto-flex / auto-grid adapter register
- 신규 PropertiesPanel 또는 기존 패널 확장 — paradigm-specific fields

`packages/design-system/`:
- `IconLayoutAbsolute.tsx` / `IconLayoutFlex.tsx` / `IconLayoutGrid.tsx`
- `TrackSizeEditor.tsx` (Triage Step 3 Grew 후보, DR-design 의무)

---

## 5. 검증 체크리스트 (weave B5)

- [ ] typecheck / vitest / declarativecheck / puritycheck 4 gate green
- [ ] size-diff CI gate — `WI020_LAYOUT_VARIANTS_ENABLED=false` 시 byte 0 증분 ✓
- [ ] size-diff CI gate — `WI020_LAYOUT_VARIANTS_ENABLED=true` 시 ≤ +12 KB gz (agocraft 8.55 + weave UI 3.5 est)
- [ ] e2e 5 시나리오 (option+drag layout / ContextualToolbar 변경 / PropertiesPanel flex / PropertiesPanel grid span / undo)
- [ ] axe-core a11y smoke (C4.5)
- [ ] DR-design 박제 (3 icon + TrackSizeEditor)
- [ ] usability session 5 user × 5 task (-30% task time target)
- [ ] CRDT round-trip — TrackSize array convergence (WI-028 paused 라 sync OFF 시 N/A, resume 시 의무)

---

## 6. Timing (RISK-002 C3.4)

```
agocraft 1.0.0 publish (WI-019 close, LG-001 follow-up)
   ↓
weave LG-001 (2026-06-08)
   ↓
agocraft B1-B5 complete + B6 publish 1.1.0-rc
   ↓ ← 본 HANDOFF status flip to "active"
weave WI-043 B1 (vendor adoption)
   ↓
weave B2-B5 (UI + e2e + DR-design)
   ↓
agocraft 1.1.0 stable publish (rc 1주 dogfood 후)
   ↓
weave WI-043 LG (LG-003 또는 WI-019 LG follow-up)
```

---

## 7. weave 의 응답 채널

- 본 HANDOFF 의 응답 = weave `records/decision-handoffs/HANDOFF-NNN-from-weave-layout-variants-wiring-trunk-merge.md` (HANDOFF-016 패턴 정합).
- agocraft 1.1.0-rc 채택 후 weave 측 trunk 머지 시 발행 의무.

---

## Links

- agocraft WI-020: [agocraft/records/work-items/WI-020-layout-variants-expansion.md](../../../agocraft/records/work-items/WI-020-layout-variants-expansion.md)
- agocraft FR-009: [agocraft/records/feasibility-reviews/FR-009-layout-variants-expansion.md](../../../agocraft/records/feasibility-reviews/FR-009-layout-variants-expansion.md)
- agocraft RISK-002: [agocraft/records/risks/RISK-002-layout-variants-expansion.md](../../../agocraft/records/risks/RISK-002-layout-variants-expansion.md)
- agocraft Engineering Plan: [agocraft/features/layout-variants-expansion/ENGINEERING_PLAN.md](../../../agocraft/features/layout-variants-expansion/ENGINEERING_PLAN.md)
- weave WI-043: [WI-043-frame-layout-ux.md](../work-items/WI-043-frame-layout-ux.md)
- 관련 박제: WI-042 (v1 wiring), HANDOFF-006 (v1 active)
