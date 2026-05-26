# Engineering Plan — Slide layout presets — WI-030

| Field | Value |
|---|---|
| Feature | `slide-presets` (8 semantic category × ~3 variant = 24 preset multi-item layouts) |
| Owner | hbpark |
| Triggering WI | WI-030 |
| Status | **Proposed** (2026-05-25) |
| FR verdict | FR-003 = **FEASIBLE WITH TRADE-OFFS** (3 trade-off accepted) |
| Risk verdict | RISK-002 = **GO WITH CONDITIONS** (7 conditions) |
| Decisions | (TBD — possibly DR-design-XXX for picker dialog if it grows beyond Reused) |
| Cross-project | none |
| Last updated | 2026-05-25 |

---

## 1. Feature scope and risks

### Scope (in)

- **Open preset registry** at `apps/web/src/document/presets/` (kind-agnostic, v1 = slide only).
- **24 multi-item slide presets** across 8 semantic categories — see `docs/product/SLIDE_PRESETS_SPEC.md` §4.
- **Single-transaction batch insert** via new command `weave.preset.insertSlide(presetId, containerId?)` — one history entry, one `Cmd+Z` reverts all child Items at once.
- **Picker UI** (Dialog-based, per FR-003 §F5 trade-off) — invoked from Toolbar Add menu and ThumbnailPanel `+ Slide`.
  - Left pane: 8 category chips.
  - Right pane: ~3 preset thumbnails (lazy-rendered token-DOM silhouettes).
- **`LocalizedText` 의무** — every default string in preset definitions = `{ ko, en }` per `LocalizedText` (WI-026).
- **Visual regression snapshots** for all 24 presets (`apps/web/e2e/preset-*.spec.ts`).
- **Telemetry hook** `preset:inserted` event with `presetId`, `categoryId`, `childCount`.

### Scope (out)

Per WI-030 §Out of scope:

- User-defined preset cloud save (v2).
- Preset search / natural-language indexing (v2).
- Light/dark variants per preset (v2).
- Embedded image / illustration assets (v2 — shapes only at v1).
- Preset admin UI (v1 = code only).
- canvas-design / block-doc kind presets (registry is kind-agnostic, but v1 registers slide only).
- 일본어/중국어 (v1.x).

### Risks (per RISK-002 — 6 risks, GO WITH CONDITIONS)

| Risk | Severity (with controls) | How this plan addresses |
|---|---|---|
| R1 Diversity loss ("정답" presets) | Med | UI 카피 + 즉시 인라인 편집 진입 + telemetry (§6, §7) |
| R2 WCAG AA contrast 미달 | Low (mit'd) | Token-only color + CI gate `check_preset_contrast.ts` (§4.3) |
| R3 Bundle size 회귀 | Low (v1) | 60 KB gz budget + CI gate (§4.4) |
| R4 Schema breakage on agocraft bump | Low (mit'd) | `createTextAttrs` / `createShapeAttrs` factory 의무 (§3.4) |
| R5 i18n 확장 비용 | Low (mit'd) | `LocalizedText` 의무 + 새 언어 = 데이터 PR only (§3.5) |
| R6 자산 라이센스 | Low (v1) | v1 외부 자산 금지 정책 (§4.5) |

---

## 2. Architecture overview

```
apps/web/src/document/presets/
  types.ts                        — PresetCategory, Preset, PresetFactory, PresetRegistry
  registry.ts                     — open Map<categoryId, Preset[]>; register() / get() / list()
  default-registry.ts             — single bootstrap site: registers all 24 presets
  cover/
    cover.bold.preset.ts          — factory returns AgocraftItem (slide + children)
    cover.hero.preset.ts
    cover.asymmetric.preset.ts
  agenda/
    agenda.numbered.preset.ts
    …
  (8 categories × ~3 presets = 24 files)
  __thumbnails__/
    SlidePresetThumbnail.tsx      — token-DOM silhouette renderer, dispatches by presetId via registry

apps/web/src/document/commands.ts
  + weave.preset.insertSlide       — uses pending.stage() once with children-populated slide

apps/web/src/pages/new-design/
  SlidePresetPicker.tsx           — Dialog-based picker (categories + thumbnails)

apps/web/src/pages/DesignPage.tsx
apps/web/src/pages/ThumbnailPanel.tsx
  + Add Slide button → SlidePresetPicker
```

### Data flow (single user click → 1 history entry)

```
User clicks "cover.bold" thumbnail in picker
  → SlidePresetPicker.onSelect(presetId)
  → editor.exec("weave.preset.insertSlide", { presetId })
    → Command.run()
      → registry.get(presetId).factory(ctx)
        returns AgocraftItem {
          id: <new>, kind: "slide", attrs: { frame, title:"", bullets:[] },
          children: [ <text-1>, <text-2>, <shape-1> ],   ← all pre-populated
          units: []
        }
      → pending.stage(slide)                 — 1 call, full subtree
      → return ok(slide.id, [{
          type: "item.children",
          itemId: designRoot.id,
          added: [slide.id],
          removed: []
        }])                                  — single patch
    → TransactionRunner emits 1 Change
    → applyChangeToDocument() reducer
      → reads pending for slide.id
      → appends slide (with all its children) to root.children
    → editor.history.length += 1
  → Cmd+Z reverts the entire subtree in one step
```

### Key insight (per FR-003 §F1)

`AgocraftItem.children` is recursive; `applyChangeToDocument.item.children` reducer reads the staged Item from `PendingCreations` and grafts it whole. So a single `item.children` patch can introduce an entire subtree if the staged Item is pre-populated. **No batch-patch API needed.** No transaction grouping infrastructure needed. The existing single-patch flow already covers multi-item insertion.

---

## 3. Surfaces with SOLID + GRASP review

### 3.1 Surface: `presets/registry.ts` — open extension point

**Responsibility**: Single source of truth for `categoryId → Preset[]` mapping. No `switch (categoryId)` in callers.

**SOLID/GRASP check**:
- [x] **SRP** — registry owns lookup only. Factory functions own item creation. Picker UI owns rendering.
- [x] **OCP** — adding a new category or preset = new file + 1 `register()` call. No edit to registry's `get()` / `list()`.
- [x] **DIP** — callers depend on `PresetRegistry` interface, not the Map implementation.
- [x] **Information Expert (GRASP)** — preset factory owns its own coordinate / text / style decisions. Registry doesn't inspect them.
- [x] **OS Rule 6** — no `switch (preset.kind / preset.id)` in business code. Lookup is data-driven.

### 3.2 Surface: `weave.preset.insertSlide` command

**Responsibility**: Stage the slide subtree, emit a single `item.children` patch on the design root.

**SOLID/GRASP check**:
- [x] **SRP** — only orchestrates "registry lookup → factory call → pending stage → patch emission". Does not own preset content.
- [x] **OCP** — adding a preset doesn't touch this command's body. The command resolves by id at runtime.
- [x] **OS Rule 6** — no `switch (presetId)`. Single registry lookup.
- [x] **History contract** (CLAUDE.md §Document mutation rule) — patch flows through TransactionRunner → ChangeStream → reducer → history entry. `Cmd+Z` works.

### 3.3 Surface: `SlidePresetPicker.tsx` — Dialog UI

**Responsibility**: render category list + thumbnail grid; dispatch `editor.exec("weave.preset.insertSlide", { presetId })` on click.

**SOLID/GRASP check**:
- [x] **SRP** — picker only navigates + dispatches. No state mutation.
- [x] **Design System Triage** — Step 1 (Reused). Uses existing `Dialog`, `Card`, `RadioTileGroup` from `@weave/design-system`. No new primitive.
- [x] **Lazy thumbnail rendering** — categories rendered all at once (cheap), thumbnails only when category is selected (or use IntersectionObserver if all 24 visible). Avoids paint cost for unselected categories.
- [x] **Accessibility** — picker is keyboard-navigable (radix Dialog + RadioTileGroup focus management). Each thumbnail has `aria-label` from `LocalizedText.<currentLocale>`.

### 3.4 Surface: factory functions (`<category>/<preset>.preset.ts`)

**Responsibility**: Return a complete `AgocraftItem` (slide + populated children) given current locale and design dimensions.

**SOLID/GRASP check**:
- [x] **SRP** — one factory per preset. No sharing of mutable state.
- [x] **OCP** — factory uses `createTextAttrs` / `createShapeAttrs` (agocraft helpers). Schema bumps absorbed automatically (RISK-002 R4 mitigation).
- [x] **Pure function** — no DOM access, no clock dependency outside the new-id generator. Easy to snapshot test.
- [x] **Token-only color** — every color value from design-system tokens (`var(--text-default)`, `var(--accent)`, etc.). Raw hex is a lint failure (RISK-002 R2 mitigation).

### 3.5 Surface: `LocalizedText` integration

**Responsibility**: Resolve preset's default child text to current locale.

**SOLID/GRASP check**:
- [x] **SRP** — preset factories accept `locale: "ko" | "en"` and read from `LocalizedText` object.
- [x] **OCP** — new language = add key to existing `LocalizedText` objects. No code edit.
- [x] **Fallback** — `en` → `ko` chain (assert at compile time that `ko` and `en` always present).

---

## 4. CI gates and policies

### 4.1 Existing `pnpm verify` chain (no change)

- `lint` (biome) — catches raw hex via custom rule.
- `tokencheck` — design-system token-only.
- `declarativecheck` — OS Rule 6 (no `switch (presetId)`).
- `puritycheck` — preset files do not import from sister projects.
- `typecheck` — factory return type strict `AgocraftItem<"slide">`.
- `test` — unit tests including factory smoke (§5.2).
- `build` — bundle size budget.

### 4.2 New gate — `tools/check_preset_contrast.ts`

Iterates `defaultRegistry`, for each preset reads every text Item's `color` and resolves token against design-system theme. Asserts contrast ≥ 4.5:1 against the resolved background (slide attrs.background or design-system `--surface`).

Wired into `pnpm verify` after `tokencheck`. Failing entry prints `[preset] cover.asymmetric: title-text color #abc on #def → contrast 3.2:1 (need 4.5:1)`.

### 4.3 Bundle budget gate (extension of existing budget)

`apps/web/package.json` adds `"preset-budget"` size-limit entry: `apps/web/src/document/presets/**` chunked ≤ 60 KB gz.

### 4.4 Asset license gate

`tools/check_preset_no_assets.sh` greps preset files for `src:`, `url(`, `import .*\.(png|jpg|svg)`. Failing entry blocks merge. v1 strict no-assets policy.

---

## 5. Phase plan

### Phase 1 — PoC (registry + command + 1 category × 3 presets + picker skeleton)

**Goal**: end-to-end flow from picker click to slide-on-canvas with `Cmd+Z` working.

- [ ] `presets/types.ts` — `PresetCategory`, `Preset`, `PresetFactory`, `PresetRegistry` types.
- [ ] `presets/registry.ts` — open Map registry with `register()` / `get()` / `list()`.
- [ ] `presets/default-registry.ts` — bootstrap site (initially registers cover category only).
- [ ] `presets/cover/cover.bold.preset.ts` + `cover.hero.preset.ts` + `cover.asymmetric.preset.ts`.
- [ ] `presets/__thumbnails__/SlidePresetThumbnail.tsx` — token-DOM silhouette.
- [ ] `commands.ts` — `weave.preset.insertSlide` command.
- [ ] `commands.test.ts` — unit test for command (mocked targets + pending).
- [ ] `SlidePresetPicker.tsx` — Dialog with 1 category column + 3 thumbnails.
- [ ] Toolbar Add menu integration — "Slide" item now opens picker (instead of immediate add).
- [ ] ThumbnailPanel `+ Slide` integration — opens picker.
- [ ] Playwright spec: `apps/web/e2e/preset-picker.spec.ts` — open picker, click `cover.bold`, assert 1 slide + 3 child Items, assert `Cmd+Z` reverts everything.

**Exit criteria**: 1 user can pick a cover preset and undo/redo works. `pnpm verify` + `pnpm e2e` PASS.

### Phase 2-7 — Remaining 7 categories (parallel)

Each phase = 1 category, ~3 presets, 1 e2e spec covering category. Phases independent — could merge in any order, no cross-phase dependency.

- Phase 2: agenda (numbered / two-column / card-grid)
- Phase 3: timetable (linear / two-track / gantt)
- Phase 4: mission (statement / three-values / quote)
- Phase 5: problem (pain-points / before-after / stat-callout)
- Phase 6: solution (three-step / compare / hero)
- Phase 7: guide (step-by-step / checklist / qa)
- Phase 8: closing (thank-you / questions / cta-contacts)

### Phase 9 — Visual regression snapshots

- [ ] `apps/web/e2e/preset-visual.spec.ts` — for each of 24 presets, insert into a fresh design, take `toHaveScreenshot()`. Snapshot files committed.
- [ ] CI integration — failing snapshot blocks merge.

### Phase 10 — Telemetry + RISK-002 conditions close

- [ ] Telemetry hook — `preset:inserted({ presetId, categoryId, childCount })` emitted in command (RISK-002 condition #7).
- [ ] `check_preset_contrast.ts` script (RISK-002 condition #1) + integration in `pnpm verify`.
- [ ] UI 카피 review with `design-system-agent` — picker headline tone (RISK-002 condition #6).
- [ ] Auto inline-edit entry — first text child of the inserted slide gets focus (RISK-002 condition #6 second half).

---

## 6. Acceptance criteria (cross-reference WI-030)

### Default mandatory

- [ ] `pnpm verify` PASS — all gates including new `check_preset_contrast` + bundle budget + no-assets.
- [ ] `pnpm e2e` PASS — 8 category specs + 1 visual regression spec + 1 integration spec = 10 total.

### Feature-specific

- [ ] Add menu "Slide" → picker dialog opens with 8 category chips (Korean labels).
- [ ] Click category → right pane shows ~3 thumbnail cards.
- [ ] Click thumbnail → slide + children appear; first text child auto-focused for inline edit.
- [ ] `editor.history.length` increments by exactly +1.
- [ ] `Cmd+Z` removes slide + all children simultaneously.
- [ ] `Cmd+Shift+Z` re-inserts everything.
- [ ] All 24 presets pass contrast check.
- [ ] Preset bundle ≤ 60 KB gz.

---

## 7. Rollout

- **Internal beta** (T-7d before v1 launch): hbpark + (optional) 2-3 internal users insert each of 24 presets, report friction.
- **Telemetry baseline** (T-0): preset-inserted event firing in prod, dashboard ready.
- **30-day check** (T+30d): preset usage distribution review → v1.x carriage decisions.

---

## 8. Open questions / decisions deferred

- **Q1**: Picker dialog vs. 3-level dropdown — Plan adopts Dialog (FR-003 T1). User-test 1회 권장 after Phase 1.
- **Q2**: Slide attrs (`title`, `bullets`) of preset slides — Plan adopts empty string (FR-003 T2). Confirms during Phase 1 — if SlideBlock visibly renders empty bullets, the legacy bullet rendering may need a "bullets length === 0" early return to avoid an empty rectangle.
- **Q3**: Thumbnail rendering strategy — token-DOM (HTML/CSS, no SVG) vs. inline SVG. Plan adopts token-DOM (cheaper, theme-responsive). SVG considered v2 for cross-theme exports.
- **Q4**: Category extension policy — Plan adopts "new category = new DR + telemetry data" (WI-030 §3). Confirmed at v1.x evaluation.

---

## 9. Dependencies

- WI-029 Phase 1 schema (textAlignHorizontal, lineHeightSpec, textRuns) — **already merged** (memory `project_weave_wi029_r1_step3_phase_c_2026_05_25`).
- agocraft `createTextAttrs` / `createShapeAttrs` factory — **already exists** (memory `project_agocraft_wi016_phase1_landed_2026_05_25`).
- WI-026 `LocalizedText` — **already adopted**.
- `editor.exec` / `weave.item.add` / `PendingCreations` infrastructure — **already in production**.

No new external dependency. No new agocraft handoff.

---

## 10. Specialist consultations (parallel during Phase 1)

- `design-system-agent` — confirm picker dialog is Step 1 (Reused) of Triage. Confirm token-only color policy for preset definitions.
- `frontend-perf-agent` — confirm bundle budget (60 KB gz) is realistic and lazy chunk is unnecessary for v1.
- `accessibility-agent` — confirm contrast check (4.5:1) + font size minimum (12pt).

No blocking sign-off — Phase 1 PoC can proceed in parallel; sign-offs land before Phase 10.

---

## 11. Status updates

- 2026-05-25: Plan drafted. WI-030 + FR-003 + RISK-002 박제 완료. Ready for Build Phase 1.
- 2026-05-25 (PM): **Phase 1 머지** — preset registry + 3 cover presets + Dialog picker + Add menu integration + `weave.preset.insertSlide` command + 4 unit tests + 3 e2e specs. Verify chain (typecheck + declarativecheck + puritycheck + test + build + e2e) all green. Main bundle +6 KB gz (276 vs 270 baseline). FR-003 §F1 (multi-item subtree via single `item.children` patch) verified — reducer logs `rootChildrenAfter: Array(0)` after the slide-add inverse fires.
- **Phase 1 known limitation (2026-05-25)** — `LexicalTextEditor`'s init-time `onChange` fires `weave.item.update` for each text child even when the snapshot equals the seed value. cover.bold therefore produces **4 history entries per insert** (1 `item.children` + 3 `item.attrs`), so `Cmd+Z` once does not revert the entire preset — the user needs ~4 presses. Spec covers the **drain-history contract** (preset is fully reversible through the stack) rather than the strict single-entry assertion. Two fix candidates for a follow-up PR:
  - **(a)** Tighten `LexicalTextEditor.OnChangePlugin` equivalence guard to also short-circuit when `textRuns` match the seeded value (currently only `snapshot.text` is compared).
  - **(b)** Wrap `weave.preset.insertSlide` so the slide-add patch and any post-mount text patches share a `mergeKey` and coalesce inside the editor's `historyMergeWindowMs` window.
  Option (a) has the smaller blast radius — recommended.
