# RULE — @weave/web (apps/web)

The weave application. weave is a **host app, not a tree-shakeable library**, so it follows OS-root `CODE_STRUCTURE_DESIGN_RULES.md` **Rule 2 as written** (classes for stateful runtime objects are fine; weave does NOT adopt agocraft's factory-only DR-013 — see weave `CLAUDE.md` § Code design conventions). The rules that bind code here:

## Document mutation — single command-sourced path (Rule 4 / the mutation contract)

Every document mutation routes through `editor.exec("weave.<verb>", input)` → `Patch` → `ChangeStream` → `editor.history`. **No `setAgoDoc` / direct doc-state write outside `useDocument` / the `applyChange` reducer.** Every new mutation surface (handle, hotkey, plugin button, toolbar action, remote sink) needs a `weave.<verb>` command computing a real `Patch` **and** an e2e undo/redo test (`apps/web/e2e/history-*.spec.ts`). High-frequency drags fold to one undo step via `mergeKey` + `historyMergeWindowMs`. Sanctioned non-history writes (derived projections — chart labels DR-035, embed meta WI-139; remote-replace; new-design seed) are the only exceptions and must stay derived-only. See root `CLAUDE.md` § "Document mutation rule" and OS Rule 4 § "Command-sourced state".

## Declarative dispatch (Rule 6)

No `switch` / `if-else` on a closed-list discriminant inside commands, reducers, renderers, toolbars, or intent routing. **The lint gate (`tools/check_declarative_dispatch.sh`) only stem-matches `kind|type|mode|category|variant|shape` — it does NOT catch `operation`/`op`/`status`/`role`-style discriminants or bare non-`else if` chains, so confirm those by reading, not by a green gate** (the `intentFromOperation` regression, DR-106, slipped exactly this way). Per-kind/-operation behavior resolves through a registry, one adapter per file: `DOMAIN_RENDERERS`, `toolbarSectionRegistry`, `SelectionChromeRegistry`, `ATTRS_NORMALIZERS` / `RAW_ATTRS_NORMALIZERS`, `INTENT_FROM_OPERATION` / `REOPERATE_TARGET`, `INTENT_ROUTES`.

## Serialization round-trip (Rule 5)

Document state persists to KV in a **shared anonymous workspace where mixed-version clients write the same keys** (see `apps/web/CLAUDE.md` § security model). Persisted state must round-trip losslessly with `onUnknown: "preserve"`. The engine round-trip is owned by `@agocraft/core`'s serializer; any weave-local attrs you add to a kind must survive a write→read cycle, and the sync path consumes the canonical `changeToPatch` from `@agocraft/core` (DR-107), never a hand-rolled subset.

## API / security (see `apps/web/CLAUDE.md`)

`apps/web/api/*` MUST call `assertKvAvailable(res)`, validate input via `_lib/validate.ts`, respond via `apiError(res, …)`, and build KV keys via `_lib/keys.ts` (never hardcode the `shared:` prefix). `window.__weave*` diagnostics are gated behind `import.meta.env.DEV`.

## Tree-shaking (Rule 2)

Named const exports; no object-catalogue / default mega-object exports (gated by `tools/check_token_catalog.sh`). Anything `packages/*` re-exports as a public surface prefers free functions over class-method surfaces.

> **Rule 1 (build-graph layer boundaries) is not yet build-enforced in weave** — there is no `.dependency-cruiser.cjs`. Boundaries are documented here and in the package RULEs; promoting them to an enforced build-graph rule (so a violating import fails CI, not review) is a tracked follow-up.
