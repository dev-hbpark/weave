# HANDOFF-006 (FROM agocraft) — layout management v1 wiring request

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-006 (weave inbox) |
| Direction | agocraft (sister) → **weave (this project)** |
| Sender | agocraft (sister service project, `workspace/agocraft/`) |
| Target | weave (this project) |
| Date sent | 2026-05-28 |
| Severity | P2 (post-LG-001 — does NOT block weave v1 launch on 2026-06-08) |
| Status | **Open** — awaiting weave WI to be filed |
| Originating WI | agocraft WI-019 (`workspace/agocraft/records/work-items/WI-019-layout-management.md`) |
| Related artifacts | FR-008, RISK-001, ENGINEERING_PLAN, CHANGELOG entry (BREAKING) |
| Vendor version target | next 1.0.0-rc.* after agocraft B5 publish |

---

## 1. What agocraft has delivered (WI-019 B1-B6, 2026-05-28)

Six build phases shipped in agocraft trunk, totalling **182 new unit tests** and one new package:

| Phase | Deliverable |
|---|---|
| **B1** | `@agocraft/core/layout` — `LayoutKind`, `LayoutSpec`, `LayoutChildPolicy`, `AnchorH`, `AnchorV`, `ANCHOR_H`, `ANCHOR_V`, `LAYOUT_KINDS`. `Item attrs` extended with optional `layout?` + `layoutChild?`. (50 unit) |
| **B2** | 2 Patch / Change variants `item.layout` and `item.layoutChild`. Self-inverting via `before/after` swap. History `mergeKeyOf` folds multi-tick anchor drags into one undo entry. (51 unit) |
| **B3** | New package **`@agocraft/layout`** — `LayoutAdapter` interface, `createLayoutRegistry`, `createAbsoluteConstraintsAdapter`. Ratio-native anchor solver via `HORIZONTAL_FORMULAS` / `VERTICAL_FORMULAS` lookup tables (Rule 6 compliant). Bundle **1.55 KB gzipped**. (81 unit + contract fixture for v2/v3) |
| **B4** | **BREAKING** — `TextAttrs.textAutoResize` removed. `migrateTextAutoResizeToLayoutChild` Migration exported (handles v9 → v10). `CURRENT_SCHEMA_VERSION` 9 → 10. CHANGELOG entry. (30 unit) |
| **B5** | `@agocraft/sync` — `applyPatchToYDoc` writes both new variants onto attrs Y.Map; `seedYDocFromDocument` / `deriveDocumentFromYDoc` preserve layout fields by default. CRDT-deterministic. (20 unit) |
| **B6** | `@agocraft/editor` — `computeLayoutPatchesOnParentResize` helper for gesture command bodies (pure function, takes a `LayoutRegistry` + parent/children context, returns `Patch[]`). (15 unit) |

Public surface to import:

```ts
// types
import type {
  AnchorH, AnchorV,
  LayoutKind, LayoutSpec, LayoutChildPolicy,
} from "@agocraft/core";

// migration (v9 → v10)
import { migrateTextAutoResizeToLayoutChild } from "@agocraft/core";

// adapter package
import {
  createLayoutRegistry,
  createAbsoluteConstraintsAdapter,
  type LayoutAdapter,
  type LayoutRegistry,
} from "@agocraft/layout";

// host gesture command helper
import { computeLayoutPatchesOnParentResize } from "@agocraft/editor";
```

---

## 2. What weave is requested to do (mapped to RISK-001 conditions)

A new weave WI should bundle the following — there is **no rush**; this is post-LG-001 work. Recommend filing as **WI-NNN** with priority below the LG-001 stabilisation window.

### 2.A — Schema v9 → v10 migration registration (RISK-001 C1.1, C1.4, C3.2, C3.4)

- **C1.1 / C3.4**: Register `migrateTextAutoResizeToLayoutChild` on every weave `Serializer.fromJSON({ migrations: [...] })` call. Existing weave designs that carry `textAutoResize` automatically upgrade on first load.
- **C1.4**: This PR must merge **synchronously** with agocraft's `1.0.0` (post-rc) publish. Coordinate the version bump + weave PR merge; do not merge weave before agocraft publishes the breaking version. Schema v9 backup helper in `storage.ts` (existing weave pattern from WI-029 Phase 1.5) MUST remain available for 90 days as fallback (C3.3).
- **C3.4**: weave e2e — migration round-trip on real designs (3 textAutoResize values × ≥ 10 design samples). Expected: zero visual diff after migration.

### 2.B — TextBlock UI swap (RISK-001 C2.1, C2.2)

Weave's existing `textAutoResize` SegmentedControl (per WI-029 Phase 1.5) needs to be replaced with a **LayoutChildPolicy picker**:

- **C2.1**: Two 4-anchor SegmentedControls (`horizontal: left/right/center/scale`, `vertical: top/bottom/center/scale`) — total 16 combinations. Helper text must explicitly note "비율 기준 (Figma px-기준과 다름)" — anchor semantics differ from Figma in that they're ratio-native, not px-fixed. UX intent disclosure is mandatory.
- **C2.2**: Labels phrased as user intent ("화면이 커지면 자식도 비례" / "왼쪽 고정" / etc.), not the technical anchor literals. Pair with `copy-information-architecture-agent`.

### 2.C — Frame resize gesture wiring (RISK-001 C3.4)

Inside weave's frame resize command body (the one that emits the parent's `item.attrs` Patch for the new frame), additionally:

```ts
import { computeLayoutPatchesOnParentResize } from "@agocraft/editor";
import { LayoutRegistryToken } from "...";  // weave's DI wire

const layoutPatches = computeLayoutPatchesOnParentResize({
  parentLayout: parent.attrs.layout,
  parentOldRatio: parent.attrs.frame,
  parentNewRatio: newFrame,
  children: parent.children.map(c => ({
    itemId: c.id,
    currentFrame: c.attrs.frame,
    policy: c.attrs.layoutChild,
  })),
  registry: layoutRegistry,
});

return {
  ok: true,
  value: undefined,
  patches: [parentFramePatch, ...layoutPatches],
};
```

Critical invariant: parent frame Patch + every child layout Patch must share the **same transactionId** so Cmd+Z restores them as one operation. This happens automatically when they are returned in the same `CommandResult.patches` array.

### 2.D — Accessibility (RISK-001 C4.1, C4.2, C4.3, C4.4)

- **C4.1**: Each SegmentedControl option's `aria-label` should match the user-intent text from C2.2, not the technical anchor literal.
- **C4.2**: Helper text must be always-visible (not `visually-hidden`). All users see the same disclosure.
- **C4.3**: If the helper text is a new Banner/Tooltip primitive, run `design-system-triage` (DR-design-NNN expected).
- **C4.4**: Add axe-core smoke test on the resize panel (anchor changes should announce correctly to screen readers).

### 2.E — docs page (RISK-001 C2.3)

A `weave docs / anchor 의미` page covering:
- The 16 anchor cartesian visualised
- Difference from Figma (px-based) — example GIFs
- When to use each anchor (use cases per row)

Pair with `content-seo-strategy-agent`.

---

## 3. Critical timing constraints

| Constraint | Detail |
|---|---|
| **LG-001 (2026-06-08)** | weave v1 launch. **HANDOFF-006 work must NOT enter weave trunk before LG-001 closes** (RISK-001 C3.1). |
| **agocraft 1.0.0 publish** | Must be coordinated with the weave PR merge. agocraft holds the breaking version behind a feature flag in CI until weave is ready. (RISK-001 C3.2) |
| **Vendor pin** | Bump `workspace/weave/package.json` agocraft dependency to the new 1.0.0 version in the same PR. |
| **Backup retention** | weave `storage.ts` v9 backup helper stays for 90 days post-launch. (RISK-001 C3.3) |

---

## 4. Open trade-off decisions weave can re-litigate

The four FR-008 trade-offs were accepted as **T1 Accept / T2 Modify / T3 Modify / T4 Accept** on 2026-05-28 by hbpark. agocraft will not re-open them, but if weave's UX implementation surfaces a concrete usability problem (e.g., users repeatedly mis-set anchor because the ratio semantic confuses them), the natural path is:

- File a new agocraft WI to revisit the anchor literal set, OR
- Add weave-side UI affordances (preview animation, inline diagram) without changing the agocraft contract.

Either is fine — the contract itself is stable in 1.0.

---

## 5. Verification checklist (for weave PR review)

Tick before merging the weave wiring PR:

- [ ] `migrateTextAutoResizeToLayoutChild` registered on every `Serializer.fromJSON` call
- [ ] CHANGELOG entry in weave (mirroring agocraft's BREAKING) — disclose migration path to users
- [ ] All `textAutoResize` references in weave source removed (grep `-r textAutoResize`)
- [ ] TextBlock UI: two 4-anchor SegmentedControls + helper text + aria-labels
- [ ] Frame resize command emits parent + child Patches in one `CommandResult.patches` array
- [ ] e2e: migration round-trip × 10 design samples, no visual diff
- [ ] e2e: anchor cartesian × frame resize visual outcomes
- [ ] axe-core smoke on resize panel
- [ ] vendor pin bumped to agocraft 1.0.0
- [ ] storage.ts v9 backup helper retained
- [ ] Sync coordination: weave PR merges within hours of agocraft 1.0.0 publish

---

## 6. Reference links (agocraft side)

- WI-019: `workspace/agocraft/records/work-items/WI-019-layout-management.md`
- FR-008: `workspace/agocraft/records/feasibility-reviews/FR-008-layout-management.md`
- RISK-001: `workspace/agocraft/records/risks/RISK-001-layout-management.md`
- Engineering plan: `workspace/agocraft/features/layout-management/ENGINEERING_PLAN.md`
- CHANGELOG (BREAKING entry): `workspace/agocraft/CHANGELOG.md`
- Public migration helper source: `workspace/agocraft/packages/core/src/schema/migrate-text-auto-resize.ts`
- Layout adapter package: `workspace/agocraft/packages/layout/`
- Host gesture helper: `workspace/agocraft/packages/editor/src/layout-runtime.ts`

---

## 7. Response expected

When weave files its own WI for the wiring, **please write a return HANDOFF** into `workspace/agocraft/records/decision-handoffs/` indicating:

- The weave WI id
- Target merge date (post-LG-001 close)
- Any of the trade-offs (T1-T4) that need re-litigation given weave's UX research
- The version of agocraft pinned in weave at merge time

No reply timeline is enforced — agocraft's 1.0.0 publish is gated on weave's readiness.
