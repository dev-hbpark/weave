# HANDOFF-002 — Per-item content ViewModel as a compiler-forced `DomainKindSpec` facet

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-002 (intra-project, `records/handoffs/`) |
| Date | 2026-06-17 |
| From | session: content-view / MVVM refactor (hbpark) |
| To | session owning **WI-241 / DR-158** (`domain-kind-structure-spec`) + the `group`-kind follow-up (WI-242/DR-159) |
| Proposed records | **WI-243** + **DR-160** (provisional numbers — committed-wins per `records/handoffs/HANDOFF-001-wi-number-collision.md`) |
| Status | REQUESTED — fold into the WI-241 spec-facet line; do **not** start until Phase 0 coordination below |
| Related | DR-158 (structure facet), AUDIT-005 (DomainKind single-source registry), root `CLAUDE.md` § UI_COMPONENT_STRUCTURE (view/hook split litmus) |

## Why this is your work, not a separate registry

DR-158 established the pattern and the door: a kind's facts are declared as
**required, discriminated fields on `DomainKindSpec`**, made non-omittable by the
exhaustive `SPECS` mapped type, and *"separate capability axes … become their OWN
spec facets."* The per-item **content ViewModel** is the **rendering facet** of
exactly that design.

Today `DomainKindSpec` carries `{ meta, renderer, defaultAttrs,
participatesInZorder, structure }`. The content View (`TextBlock`, `ChartBlock`,
…) is a single `renderer` component that mixes Model-read + derivation + state +
effects + render (a "fat view"). It violates the root `CLAUDE.md` UI rule
(*"view renders from props with no provider; hook tests with `renderHook` and no
DOM"*) and — the operator's framing — **a new kind can be added with no ViewModel
discipline at all**, the same accidental-omission gap WI-241 closed for structure.

The ask: ride WI-241's forcing function so that **adding a kind is a compile error
until its content ViewModel is declared**, for *every* kind, uniformly.

## Decision to record (proposed DR-160)

Replace the hand-authored `renderer` with two **required** facets and a derived
renderer:

```ts
// new required fields on DomainKindSpec<K>
readonly useViewModel: ItemViewModelHook<K>;   // (item, onUpdate?) => ItemVm<K>  — a hook
readonly view: PureItemView<K>;                // (props: { item; vm: ItemVm<K> }) => JSX.Element

// renderer is no longer hand-written per kind — it is GENERATED from the pair:
readonly renderer: ComponentType<DomainRendererProps<K>>;  // = makeKindRenderer({ useViewModel, view })
```

`makeKindRenderer` is the only thing that calls the hook then the view:

```ts
function makeKindRenderer<K extends DomainKind>(
  spec: Pick<DomainKindSpec<K>, "useViewModel" | "view">,
): ComponentType<DomainRendererProps<K>> {
  return function KindRenderer({ item, onUpdate }) {
    const vm = spec.useViewModel(item, onUpdate);   // ONE hook call per kind-component
    return spec.view({ item, vm });
  };
}
```

**Why this shape (and not just "add a `viewModel` field next to `renderer`"):**
because `view`'s props *require* a `vm`, and the only producer of a `vm` is the
spec's `useViewModel`, the split is **compiler-forced, not conventional** — you
cannot register a View that bypasses its ViewModel because you do not author the
renderer at all; it is generated. This is the difference between "forced by the
design" (what WI-241 achieved for structure) and "forced by code review."

**Hook-order safety (critical constraint — honor it):** the hook is called inside
the per-kind generated component, which agocraft's `FrameSurface` selects by
`item.kind`. Each kind → a distinct component identity, so a kind change
remounts (the same isolation the current per-kind `*Block` components already
rely on). Do **not** collapse the dispatch into one shared component that calls
`SPECS[item.kind].useViewModel(...)` directly — that reorders hooks on a kind
change and is a Rules-of-Hooks violation. The generated-per-kind component is the
safe seam.

**No agocraft change required.** `FrameSurface` / `createDomainRendererRegistry`
keep consuming `Record<kind, ComponentType<DomainRendererProps>>`; only the
*value* changes from a hand-written `XBlock` to `makeKindRenderer(spec)`. The
agocraft→weave one-way boundary (FrameContent.tsx) is untouched.

### Why required-for-all, even near-pure kinds (the DR-158 line)

`image` / `qr` / `video` are nearly pure today — their VM is ~3 lines (derive
opacity/fit, passthrough). DR-158 already rejected "optional field + silent
default" for structure for exactly this temptation. Keep `useViewModel` **required
and explicit**: a thin VM is honest and becomes the single seam the moment the
kind grows (e.g. video gains play-state). No `identityViewModel` default — that
reintroduces the silent-omission gap WI-241 closed.

## Engineering plan (folds into the WI-241 facet rhythm: scaffold → per-kind)

WI-241 shipped "scaffold first (behavior-neutral data+helpers+test), then wire."
Mirror that exactly.

### Phase 0 — Scaffold + 2 reference kinds  *(COORDINATED — same commit zone as WI-241; you own it)*

Single small change on `domain-kinds.ts` + the two fattest kinds, so the contract
is proven before fan-out. **Must be one session's commit** (this file is the
contention point with your group-kind work).

1. Add `ItemViewModelHook<K>`, `PureItemView<K>`, `ItemVm<K>` contract types.
2. Add required `useViewModel` + `view`; make `renderer` derived via
   `makeKindRenderer`. The mapped type now compile-errors any kind missing the pair.
3. Migrate **text** and **chart** (sketches already exist — see Appendix refs):
   `text-item-view-model.ts` + `TextView`, `chart-item-view-model.ts` + `ChartView`.
4. `domain-kinds.viewmodel.test.ts` (new, parallels `domain-kinds.structure.test.ts`):
   exhaustive presence of `useViewModel`+`view` for all kinds, + a `renderHook`
   smoke per migrated VM.

Behavior-neutral gate: e2e for text edit (`history-*`, text specs) and chart
(`chart-*` specs) stay green — this is a pure extraction, **zero behavior change**.

### Phases 1..N — Per-kind migration  *(PARALLELIZABLE after Phase 0 lands)*

One kind per change, each its own small PR/commit, independently verifiable:

| Kind | VM weight | Notes |
|---|---|---|
| frame | medium | paint + child-host; reads layout box context |
| shape | medium | sub-attrs, corner radii, decoration unit |
| line | thin–medium | points/heads derivation |
| image | thin | fit/opacity/borderRadius passthrough |
| video | thin→grows | play-state is the future seam |
| qr | thin | value/ecLevel passthrough |
| embed | thin–medium | provider/url resolution |

Each migration = (a) extract `x-item-view-model.ts` (hook owns all Context reads,
state, effects, derivations), (b) reduce `XBlock` to a pure `XView({item, vm})`,
(c) flip the SPECS entry to `useViewModel + view`, (d) **decommission** the old
inline logic in the same change (root `CLAUDE.md` Decommission Sweep — migrate the
coverage, never leave the old fat Block half-emptied or a spec red).

### Phase N+1 — Build-graph gate (makes the split real, not cosmetic)

Add a dependency-cruiser rule (root `CLAUDE.md`: *"express layer boundaries as
build-graph rules, not conventions"*):

- `domains/**/?*View.tsx` (pure views) may **NOT** import `useContext`,
  `useResolveColor`/resolver-context, `useSelection`, `useResolveDataset`, any
  `*-store`, or `selection-chrome/*`. Only `*-item-view-model.ts` may.
- This turns the *"view renders from props with no provider"* litmus into a CI
  failure, so a future contributor cannot quietly re-fatten a View.

## Naming discipline (chart makes this mandatory — 3 "view-model"s coexist)

| File pattern | Surface | Role |
|---|---|---|
| `domains/**/<kind>-item-view-model.ts` *(new)* | **content View** | derivation + state + intent for the rendered item |
| `selection-chrome/*-view-model.tsx` *(exists)* | **handle overlay** | per-datum/handle specs for SelectionLayer |
| `domains/chart/chart-*-store.ts` *(exists)* | overlay↔echarts bridge | layout/hover sync (non-React) |

Enforce: content VM = `*-item-view-model.ts`; chrome VM stays
`selection-chrome/*-view-model.tsx`; dependency-cruiser forbids content VM ↔
selection-chrome imports both ways. Without this, "chart view-model" is
grep-ambiguous across three surfaces.

## Invariants to preserve (do not regress)

- **Mutation rule** (`apps/web/CLAUDE.md`): VMs only *gather* intent and call
  `onUpdate` → `editor.exec("weave.<verb>")`. No `setAgoDoc` / direct mutation in
  a VM. The VM is allowed to own transient view-state (`isEditing`, drill gate)
  but never document state.
- **Rule 6**: the `empty | ready` style discriminants a VM returns (e.g. chart)
  are fine for the View to `switch` on — they are VM-output view-states, not the
  `kind`/`role`/`mode` discriminants the declarative gate watches. Keep the
  discriminator a plain status string, not `role`.
- **DR-053 "pure renderer"** intent is *strengthened*, not broken: the View
  becomes genuinely pure; the derivations move to a named seam instead of living
  inline under a "PURE renderer" comment that no longer matches the body.

## Sequencing / coordination ask (the actual handoff)

1. Land your **group-kind** follow-up (WI-242) first if it's mid-flight — it only
   touches `structure`, no overlap with this facet.
2. Do **Phase 0** as the next `domain-kinds.ts` facet (you own the file; one
   commit avoids the merge-conflict this handoff exists to prevent).
3. After Phase 0 is on `main`, the per-kind phases can be parallelized back to
   this session (or any) — they touch `domains/<kind>/*` independently and no
   longer contend on `domain-kinds.ts` beyond a one-line SPECS flip each.
4. Open **WI-243** (+ **DR-160**) when you pick this up; if the numbers are taken
   by then, renumber (committed-wins) and update this handoff's back-reference.

## Appendix — existing sketches (already drafted this session, faithful to source)

- `TextBlock` → `useTextItemViewModel` + pure `TextView`: owns `resolveFontSize`,
  align/lineHeight mapping, `containerStyle`/`textStyle`, synchronous `fitScale`
  (model-measured, no DOM), `isEditing` FSM + escape/`textEditTrigger` effects,
  `useSelection`/`useResolveColor` DI.
- `ChartBlock` → `useChartItemViewModel` + pure `ChartView`: owns dataset
  resolution (`useResolveDataset(datasetId)`), `migrateEncoding`, `isPlottable` →
  `empty|ready` status, the drill-selection FSM (`isChartSelected` imperative read
  + `markSelection`/`legendSelection` intent mapping), and the three click
  handlers. View becomes `status==="empty" ? <Placeholder/> : <EChartView
  {...vm.echartProps} …/>`.

These two are the Phase-0 reference kinds because their derivation/FSM weight
gives the largest `renderHook`-testability payoff and proves the contract against
both the simple (attrs-only) and the rich (external-store + FSM) ends of the kind
spectrum.
