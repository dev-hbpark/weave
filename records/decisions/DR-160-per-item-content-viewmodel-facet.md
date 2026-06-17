# DR-160 — Per-item content ViewModel as a compiler-forced `DomainKindSpec` facet

## Metadata

| Field | Value |
|---|---|
| ID | DR-160 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **PROPOSED** (not yet built/verified — accept on Phase-0 landing) |
| Work Item | [WI-243](../work-items/WI-243-per-item-content-viewmodel-spec-facet.md) |
| Handoff | [HANDOFF-002](../handoffs/HANDOFF-002-per-item-viewmodel-spec-facet.md) |
| Related | DR-158 (structure facet — the pattern + the door this walks through), AUDIT-005, root `CLAUDE.md` § UI_COMPONENT_STRUCTURE / § Core Engineering Principles (build-graph boundaries) |

## Context

DR-158 made a kind's **structural** facts a required, discriminated field on
`DomainKindSpec`, non-omittable via the exhaustive `SPECS` mapped type, and
explicitly left the door open: *"separate capability axes … become their OWN spec
facets — not crammed into `structure`."*

The content View is the missing facet. Today `renderer` is one hand-authored
component per kind that mixes Model-read + derivation + state + effects + render
(a "fat view"). This breaks the root `CLAUDE.md` UI litmus (*"view renders from
props with no provider; hook tests with `renderHook` and no DOM"*) and lets a new
kind ship with **no content-ViewModel discipline whatsoever** — the same
accidental-omission gap WI-241/DR-158 closed for structure. (Confirmed this
session: `TextBlock` reads `item.attrs` + `useSelection`/`useResolveColor`/box
contexts directly and imports none of the `*-view-model` files; those drive the
*overlay* surface, not content.)

## Decision — declare the content View/ViewModel split as required spec facets, with a derived renderer

Add two **required** fields to `DomainKindSpec<K>` and make `renderer` derived
from them:

```ts
readonly useViewModel: ItemViewModelHook<K>;   // (item, onUpdate?) => ItemVm<K> — a hook
readonly view: PureItemView<K>;                // ({ item, vm }) => JSX.Element — pure, no provider
readonly renderer: ComponentType<DomainRendererProps<K>>;
//        = makeKindRenderer({ useViewModel, view })   // generated, not hand-written
```

`makeKindRenderer` is the sole caller of the hook then the view:

```ts
function makeKindRenderer<K extends DomainKind>(
  spec: Pick<DomainKindSpec<K>, "useViewModel" | "view">,
): ComponentType<DomainRendererProps<K>> {
  return function KindRenderer({ item, onUpdate }) {
    const vm = spec.useViewModel(item, onUpdate);   // one hook call per kind-component
    return spec.view({ item, vm });
  };
}
```

Because `SPECS` is the compiler-exhaustive `{ [K in DomainKind]: DomainKindSpec<K> }`
and both fields are required, **adding a kind is a compile error until its content
ViewModel + pure View are declared** — the forcing function the operator asked
for, identical in mechanism to DR-158's `structure`.

### Why the derived-renderer shape (not "a `viewModel` field beside `renderer`")

A plain extra field would force *existence* but not *consumption*: a kind could
declare a `viewModel` and still hand-author a `renderer` that ignores it, demoting
the split back to a code-review convention. With `view`'s props **requiring** a
`vm` whose only producer is `useViewModel`, and `renderer` **generated** from the
pair, a View that bypasses its ViewModel is unrepresentable. This is the line
between "forced by the design" (DR-158's bar) and "forced by review".

### Hook-order safety (hard constraint)

The hook runs inside the per-kind generated component, which agocraft's
`FrameSurface` selects by `item.kind`; each kind is a distinct component identity,
so a kind change remounts (the isolation the current per-kind `*Block` components
already depend on). A shared dispatcher calling `SPECS[item.kind].useViewModel()`
directly would reorder hooks on a kind change — a Rules-of-Hooks violation.
**Forbidden by this DR.**

### Required-for-all, including near-pure kinds

`image`/`qr`/`video` get a ~3-line passthrough VM. Kept **required and explicit** —
no `identityViewModel` default. DR-158 rejected optional/silent-default for the
structure facet for the same reason: a default reintroduces the silent-omission
gap. A thin VM is honest and becomes the single seam the moment the kind grows.

### Naming + build-graph boundary

- Content VM: `domains/**/<kind>-item-view-model.ts`. Overlay VM stays
  `selection-chrome/*-view-model.tsx`. The non-React bridges stay
  `chart-*-store.ts`. Three "view-model" surfaces coexist (acute around chart) —
  naming keeps them grep-distinct.
- dependency-cruiser rule (root `CLAUDE.md`: *"layer boundaries as build-graph
  rules, not conventions"*): pure `*View.tsx` may not import `useContext` /
  resolver-context / `useSelection` / `useResolveDataset` / `*-store` /
  `selection-chrome/*`; only `*-item-view-model.ts` may. Content VM and
  selection-chrome may not import each other. Turns the litmus into CI.

## Alternatives considered

- **Optional `viewModel` field beside a hand-written `renderer`** — rejected:
  forces existence, not consumption; a renderer can ignore the VM (review-only).
- **Collapse dispatch into one component reading `SPECS[kind].useViewModel()`** —
  rejected: Rules-of-Hooks violation on kind change (see Hook-order).
- **`identityViewModel` default for thin kinds** — rejected: reintroduces the
  silent-omission gap DR-158 closed.
- **Leave content Views fat ("DR-053 says pure renderer")** — rejected: the
  current "PURE renderer" comment no longer matches a 200-line body with effects;
  this DR *realizes* that intent by moving derivation to a named seam.
- **Bigger MVVM (per-item View⇄ViewModel two-way binding)** — out of scope; the
  one-directional `useViewModel → view` pipe is sufficient and keeps the mutation
  rule (`onUpdate → editor.exec`) intact.

## Consequences

- Adding a kind forces a conscious content-ViewModel + pure-View declaration
  (compile error otherwise) — uniform across all kinds.
- Per-kind logic (FSM, derivation) becomes `renderHook`-testable with no DOM;
  Views become snapshot-testable from plain props — lowering reliance on e2e for
  the rendering layer (notably text-fit and chart-drill, today e2e-only).
- `DomainKindSpec` converges to: `{ meta, useViewModel, view, renderer(derived),
  defaultAttrs, participatesInZorder, structure }` — one more facet on the
  DR-158 line; `flip`/`hug`/`paste` remain candidates for future facets.
- Behavior-neutral; no agocraft change; no schema change.

## Verification (on Phase-0 landing → flip to ACCEPTED)

- `tsc --noEmit` clean (mapped type enforces both fields on all kinds).
- `domain-kinds.viewmodel.test.ts` — exhaustive presence + per-VM `renderHook`
  smoke — green.
- Reference-kind e2e (text, chart) green; behavior-neutral confirmed.
- dependency-cruiser purity rule green (Phase N+1).
