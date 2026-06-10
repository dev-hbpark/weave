# RULE — weave domain (scaffold)

**Current state:** scaffold. This directory holds no code — weave's active domain logic (item kinds, schemas, commands, the agocraft mirror) currently lives in `apps/web/src/document/`. This package is reserved for **extraction** when a domain concern earns its own boundary (the facade-sdk-mcp reuse threshold). If it is never populated, it is a Decommission Sweep candidate.

Rules that bind any code added here (OS-root `CODE_STRUCTURE_DESIGN_RULES.md`):

- **Rule 1 (boundaries).** Domain code MUST NOT import `apps/*` or another domain's internals. Depend on `@agocraft/core` **types structurally** (DR-011-style mirror types), never on `@agocraft/renderer-*`.
- **Rule 6.** No `switch`/`if-chain` on a `kind`/`type`/`operation`/`status` discriminant — register one adapter per kind.
- **Rule 5.** Every serialized kind round-trips losslessly with `onUnknown: "preserve"`.
- **Rule 2.** Named const exports, no object catalogues / default mega-objects (gated by `tools/check_token_catalog.sh`).

If this becomes a published/extracted package, add a `.dependency-cruiser` edge to enforce Rule 1 and decide the class-vs-factory stance (OS Rule 2 default — classes-for-state OK — unless a DR strengthens it).
