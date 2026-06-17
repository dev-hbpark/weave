# WI-243 — Per-item content ViewModel as a compiler-forced `DomainKindSpec` facet

## Metadata

| Field | Value |
|---|---|
| ID | WI-243 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **PLANNED — scaffold (Phase 0) coordinated with WI-241 session; per-kind phases parallelizable after** |
| Type | Refactor / extension-point — content View/ViewModel split as a required spec facet |
| Decision | [DR-160](../decisions/DR-160-per-item-content-viewmodel-facet.md) |
| Handoff | [HANDOFF-002](../handoffs/HANDOFF-002-per-item-viewmodel-spec-facet.md) (to the WI-241/DR-158 session) |
| Related | WI-241 / DR-158 (structure facet — same forcing function), AUDIT-005 (DomainKind single-source registry), root `CLAUDE.md` § UI_COMPONENT_STRUCTURE |

## Problem (requested)

The content View for every item kind (`TextBlock`, `ChartBlock`, …) is a single
`renderer` component that mixes Model-read + derivation + local state + effects +
render — a "fat view". This violates the root `CLAUDE.md` UI rule (*"view renders
from props with no provider; hook tests with `renderHook` and no DOM"*), and —
the operator's framing — **a new kind can be added with no ViewModel discipline at
all**: the same accidental-omission gap WI-241 just closed for `structure`.

The operator's requirement: ride WI-241's forcing function so that **adding a kind
is a compile error until its content ViewModel is declared**, uniformly across
every kind, and fold this into the same `DomainKindSpec` facet line DR-158 opened
(*"separate capability axes … become their OWN spec facets"*).

## Current state (why net-new)

- `DomainKindSpec` carries `{ meta, renderer, defaultAttrs, participatesInZorder,
  structure }`. `renderer` is hand-authored per kind and free to do anything.
- The "ViewModel" code that exists (`selection-chrome/*-view-model.tsx`,
  `chart-*-store.ts`) drives the **handle/overlay** surface, **not** the content
  View. The content View has no ViewModel seam at all — it reads the Model and
  Contexts directly. (Confirmed this session: `TextBlock` imports none of the
  `*-view-model` files.)
- No forcing function ties "add a kind" to "declare its content ViewModel".

## Planned change

Add two **required** fields to `DomainKindSpec<K>` and make `renderer` derived:

```ts
readonly useViewModel: ItemViewModelHook<K>;   // (item, onUpdate?) => ItemVm<K> — a hook
readonly view: PureItemView<K>;                // ({ item, vm }) => JSX.Element — pure
readonly renderer = makeKindRenderer({ useViewModel, view });  // generated, not hand-written
```

`makeKindRenderer` is the only caller of the hook → the view. Because `view`'s
props *require* a `vm` and the only producer of a `vm` is `useViewModel`, the
split is **compiler-forced**, and the exhaustive `SPECS` mapped type makes a new
kind a compile error until both are declared. See DR-160 for the rationale,
hook-order safety constraint, and the rejected alternatives.

## Plan (mirrors WI-241: scaffold → per-kind)

- **Phase 0 (coordinated, WI-241 session owns the commit):** contract types +
  required fields + `makeKindRenderer` + migrate the 2 reference kinds (**text**,
  **chart**) + `domain-kinds.viewmodel.test.ts` (exhaustive presence + `renderHook`
  smoke). Behavior-neutral.
- **Phases 1..N (parallelizable after Phase 0 lands):** one kind per change —
  extract `<kind>-item-view-model.ts`, reduce `XBlock` to pure `XView`, flip the
  SPECS entry, **decommission** the old inline logic in the same change.
- **Phase N+1:** dependency-cruiser gate — pure `*View.tsx` may not import
  `useContext` / resolver-context / `useSelection` / `useResolveDataset` /
  `*-store` / `selection-chrome/*`; only `*-item-view-model.ts` may. Turns the
  litmus into a CI failure.

## Per-kind triage (VM weight)

| Kind | Weight | Note |
|---|---|---|
| text, chart | heavy | Phase-0 reference kinds — FSM + derivation, largest `renderHook` payoff |
| frame, shape, line, embed | medium | layout-box/sub-attrs/points/url derivation |
| image, qr, video | thin | passthrough VM (~3 lines); video's play-state is the future seam |

Thin VMs stay **required + explicit** (no `identityViewModel` default) — DR-158
already rejected silent defaults for the structure facet, same reasoning here.

## Invariants to preserve

- **Mutation rule** (`apps/web/CLAUDE.md`): VM gathers intent → `onUpdate` →
  `editor.exec`; never `setAgoDoc`. VM owns transient view-state only (`isEditing`,
  drill gate), never document state.
- **Rule 6**: VM-output status (`empty | ready`) is a plain view-state string a
  View may `switch` on — not a `kind`/`role`/`mode` discriminant.
- **DR-053 "pure renderer"** is strengthened, not broken — the View becomes truly
  pure; derivations move to a named seam.
- **Hook-order**: the hook is called inside the per-kind generated component only
  (agocraft selects it by `item.kind`); never a shared dispatcher calling
  `SPECS[kind].useViewModel()` directly.

## Verification (planned gates)

- `tsc --noEmit` clean — mapped type forces all kinds to carry `useViewModel` +
  `view`.
- `domain-kinds.viewmodel.test.ts` exhaustive presence + per-VM `renderHook` smoke.
- Per-kind e2e stays green (text `history-*`/text specs, chart `chart-*` specs) —
  pure extraction, zero behavior change.
- dependency-cruiser purity rule green (Phase N+1).

## Scope boundary

Behavior-neutral refactor. No new product behavior; no document-schema change; no
agocraft change (FrameSurface keeps consuming `Record<kind, Component>`, only the
value changes from a hand-written Block to `makeKindRenderer(spec)`).
