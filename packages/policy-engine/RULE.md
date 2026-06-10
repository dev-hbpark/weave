# RULE — weave policy-engine (scaffold)

**Current state:** scaffold (no code). Reserved for centralized policy / permission / mode-gate logic; weave's current policy-shaped logic (e.g. intent routing, mode gates) lives in `apps/web/src`. Extract here when it earns a boundary; otherwise a Decommission Sweep candidate.

A "policy engine" is exactly where Rule 6's **mode-gate discipline** matters most, so the rules bind especially hard here:

- **Mode / permission / role gates are single-source predicate hooks** (`useXAllowed()` / one resolver), never inline `if (mode === "…")` / `if (role === "…")` scattered across consumers. The engine is the one source of truth for what each mode/role/status permits.
- **Rule 6.** Policy resolution is registry/table-driven, not a `switch (role)` / `if (action === …)` chain. **Note:** `role`/`action`/`status`/`operation` are discriminants the lint gate does NOT stem-match — enforce these by review, the gate will pass them silently.
- **Rule 5 / Rule 2** as for any package (round-trip for any persisted policy; named const exports).
