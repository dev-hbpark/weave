# RULE — weave ui (scaffold)

**Current state:** scaffold (no code). weave's active components live in `apps/web/src`; the shared design system is `packages/design-system/` (`@weave/design-system`). This package is reserved for extraction of genuinely shared, domain-free UI primitives; otherwise a Decommission Sweep candidate.

Rules that bind UI code:

- **Design System Triage runs before any component is added or modified** (root `CLAUDE.md`): walk reuse / extend / grow / escape against `@weave/design-system`, not app-local CSS. Steps 3–5 (new primitive / token / theme) and public-facing surfaces trigger a `records/design-reviews/DR-design-<NNN>` collaboration.
- **No feature logic in shared UI primitives** — primitives stay domain-free (frontend-architecture rule); feature behavior is injected.
- **Prefer platform primitives** (`<dialog>` / Popover API / CSS Anchor Positioning / Container Queries) before a custom component or third-party lib — OS `docs/04-specialized-engineering/MODERN_WEB_GUIDANCE.md`.
- **Rule 6** for any per-variant component dispatch (a registry / `Record<variant, Component>` mapping resolved by lookup, not `switch (variant)`); **Rule 2** named exports, no catalogues.
