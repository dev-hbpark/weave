# WI-042 — Layout management v1 wiring (HANDOFF-006 response)

## Metadata

| Field | Value |
|---|---|
| ID | WI-042 |
| Title | Wire agocraft `@agocraft/layout` v1 into weave — schema v9→v10 migration, frame-resize gesture, layout-child picker UI |
| Owner | hbpark |
| Status | **Active build** (2026-05-28). HANDOFF-006 의 weave 측 응답 — agocraft 1.0.0-rc 의 새 layout types 채택. |
| Severity | P2 (does NOT block LG-001 / weave v1 launch on 2026-06-08; the work is gated behind `WI019_LAYOUT_ENABLED` flag, default false, so trunk merging is safe) |
| Created | 2026-05-28 |
| Target date | 2026-06-15 (flag flip + e2e). Build trunk merge: 2026-05-28 with flag=false. |
| Closed | — |
| Related | HANDOFF-006 (agocraft → weave), agocraft WI-019 / FR-008 / RISK-001 / ENGINEERING_PLAN / LG-001 / CHANGELOG breaking |

## Summary

agocraft B1-B6 가 schema v9 → v10 BREAKING + `@agocraft/layout` 신규 패키지 + `migrateTextAutoResizeToLayoutChild` migration helper + `computeLayoutPatchesOnParentResize` gesture helper 를 발행했다 (HANDOFF-006). weave 측이 새 agocraft 를 vendor 에 pin 하기 위해서는:

1. weave source 의 `textAutoResize` 16 occurrences 가 (a) 제거되거나 (b) `attrs.layoutChild` 기반으로 forward-compat 매핑되어야 typecheck 통과.
2. agocraft vendor 의 tarballs 재패킹 + `pnpm install`.
3. `Serializer.fromJSON({ migrations: [...] })` 의 모든 호출 site 에 `migrateTextAutoResizeToLayoutChild` 등록 (RISK-001 C1.1).
4. `TextBlock` UI 의 `textAutoResize` SegmentedControl → `LayoutChildPolicy` 2-axis picker (RISK-001 C2.1 / C2.2 / C4.1).
5. Frame-resize command 가 `computeLayoutPatchesOnParentResize` 를 호출해 child rect patches 를 동일 transaction 으로 emit (RISK-001 C3.4).

전 surface 는 `WI019_LAYOUT_ENABLED` env flag (default `false`) 뒤에서 동작 — flag false 시 기존 동작 보존. LG-001 (2026-06-08) 의 일정에 영향 없음.

## Scope

### In scope (이 WI 의 trunk merge 분량)

- **A.** weave 의 `textAutoResize` 16 occurrences 정리 (`apps/web/src/document/seed.ts`, `migrate-frame-only.ts`, `domains/TextBlock.tsx`, `toolbar/sections/text-section.tsx`, `pages/FrameStage.tsx`):
  - `seed.ts` / `migrate-frame-only.ts`: 신규 seed 에서 `textAutoResize: "HEIGHT"` line 제거 — 새 디자인은 default 동작 (host 가 "scale-top" 처럼 처리 가능, undefined 시 안전 fallback).
  - `TextBlock.tsx`: `attrs.textAutoResize ?? "HEIGHT"` 의존을 `layoutChild?.anchor` 기반으로 derive (compat shim).
  - `text-section.tsx`: `textAutoResize` SegmentedControl → `layoutChild` 2-anchor picker. helper text + aria-label disclosure.
  - `FrameStage.tsx`: `switch (attrs.textAutoResize)` block 정리 (compat shim).
- **B.** `apps/web/scripts/repack-vendor.sh` 실행 — agocraft B1-B6 의 새 binaries 채택. package.json + pnpm-lock 갱신.
- **C.** `Serializer.fromJSON` 호출 site 모두에 `migrateTextAutoResizeToLayoutChild` 등록. localStorage / KV / BroadcastChannel deserialize 경로 cover.
- **D.** frame-resize command (`apps/web/src/document/commands.ts` 의 해당 command) 가 `computeLayoutPatchesOnParentResize` 를 호출해 ChildPatches 를 `CommandResult.patches` 에 합성. **`WI019_LAYOUT_ENABLED` flag 뒤에서**.
- **E.** weave 의 4 gate green: typecheck / vitest / declarativecheck / puritycheck. Build green.

### Out of scope (이 WI 의 trunk merge 외 — 별 PR / 별 WI)

- e2e 갱신 (migration round-trip × 10 fixture, anchor cartesian × resize) — RISK-001 C3.4 의 full satisfaction. LG-001 close 후 별 PR.
- axe-core smoke (C4.4) — 별 PR.
- weave `docs/anchor-meaning.md` 페이지 (C2.3) — 별 PR.
- "Helper text always visible" + "design-system Banner/Tooltip primitive" 검토 (C4.2 / C4.3) — design-system-triage 의 별 사이클.
- `WI019_LAYOUT_ENABLED` flag flip (`true` default) — post-LG-001 staging window 확보 후.

## Dependencies

- agocraft B1-B6 commits — 모두 머지됨 (workspace/agocraft trunk).
- agocraft `1.0.0-rc.<new-timestamp>` — repack-vendor.sh 가 자동 생성.
- LG-001 (weave v1 launch, 2026-06-08) — flag default `false` 라 영향 없음.

## Done criteria

### v1 trunk merge (이 WI)

- [ ] 5 files 의 `textAutoResize` 16 occurrences 정리 (typecheck 통과)
- [ ] vendor 재패킹 + agocraft 새 binaries pin
- [ ] `migrateTextAutoResizeToLayoutChild` 등록 (모든 fromJSON site)
- [ ] frame-resize command 가 layout-runtime 호출 (flag 뒤에서)
- [ ] text-section UI 가 LayoutChildPolicy picker 로 교체 (flag 뒤에서, 또는 always-shown 으로 두 surface 공존)
- [ ] weave 4 gate green
- [ ] CHANGELOG / migration disclosure 박제 (`CHANGELOG.md` weave 측)

### post-LG-001 (별 PR / 별 WI)

- [ ] e2e migration round-trip × 10 fixture
- [ ] e2e anchor cartesian × frame resize visual
- [ ] axe-core smoke
- [ ] `WI019_LAYOUT_ENABLED=true` 의 staging window 확보 + 점진 rollout

## Links

- HANDOFF (originating): [HANDOFF-006](../decision-handoffs/HANDOFF-006-from-agocraft-layout-management-wiring.md)
- agocraft WI-019: `workspace/agocraft/records/work-items/WI-019-layout-management.md`
- agocraft FR-008 / RISK-001 / ENGINEERING_PLAN / LG-001 / CHANGELOG: same project, see HANDOFF-006 § 6
- 패턴 reference: WI-029 Phase 1.5 (이전 schema migration), WI-018 (CommandResult.patches batch transaction)
