# RULE.md — features/design-system

> Project-anchored binding for the OS-root `design-system-triage` skill. Read both this file and the SKILL before any UI touch.

## Hard rules (CI-enforceable)

1. **Every UI component lives in `packages/design-system/`.** Components inside `apps/<surface>/src/` are limited to one-off **composition** of design-system primitives — no inline buttons, cards, inputs, badges, dialogs, popovers, toasts, or other reusable shapes.
2. **No hard-coded visual values in app code.** Color, spacing, radius, shadow, motion duration, motion easing, typography size — all read from CSS variables defined in `packages/design-system/src/tokens.css`. Hard-coded values in `apps/<surface>/src/**` count as DEBT and require an entry in `PRODUCTION_BACKLOG.md`.
3. **`prefers-reduced-motion: reduce` always wins.** Every motion path must short-circuit to a fade-only fallback via `useReducedMotion()` (motion lib) or `@media (prefers-reduced-motion)` (CSS).
4. **Variant ceiling: 5 per component.** A 6th variant requires `design-system-agent` review and a written justification ("why none of the existing 5 fit + why this isn't just a one-off use case").
5. **Theme registry is closed.** The current closed set is `{ aurora, mono, vivid }`. Adding a 4th requires a Design Review (DR-design-NNN), `seo-ai-visibility-agent` sign-off, and an updated `ThemeName` union.
6. **No inline `style={{…}}` with literal color/size/motion.** Allowed exceptions: dynamic computed values (animation `delay={index * 0.05}`), demo-only sandboxes (mark with `// SANDBOX:` comment).

## Soft rules (reviewer-enforceable)

- Component file names are PascalCase and one component per file, except very small co-located helpers.
- Public surface is **named const exports only** — no default export, no catalogue objects. (Same rule as the rest of the codebase per the OS-root code-structure design rules.)
- Component prop interfaces are explicit (no `{ ...rest }` without an Omit-narrowed type).
- `forwardRef` is used for any component that wraps a native focusable / form element.

## When to write a Design Review

Walk the decision tree in `.claude/skills/design-system-triage/SKILL.md`. The outcomes that **require** a `records/design-reviews/DR-design-<NNN>-<slug>.md`:

- 🌱 **Grew** outcomes (steps 3, 4, 5 of the tree): new primitive, new token, new theme variant.
- Any change touching `apps/<surface>` 의 **public-facing** routes (landing, marketing, docs).
- Any change that adds a new dependency to `@weave/design-system` (`library-adoption-supply-chain-governance-agent` sign-off required as well).

Outcomes that do **not** need a Design Review (still record the triage outcome in the WI / feature DECISION_LOG):

- ✅ **Reused** — used an existing primitive without modification.
- 🔧 **Extended** — added a within-ceiling variant or size to an existing primitive (agent review only, no human review required unless ceiling reached).

## Design-team collaboration (current and future)

- **Today** (single owner): `design-system-agent` is the automated reviewer. Owner = `hbpark` signs off the human row of the Design Review.
- **Tomorrow** (design team forms): write the Design Review, then file an intra-project handoff at `records/handoffs/HANDOFF-<NNN>-design-review.md` to the design team's lead. SLA = 2 business days. Miss → mark **Agent-Reviewed (pending human)** and proceed at owner's risk; record the deferred sign-off in the WI's status updates.

## What to check at build time

- `pnpm lint` — Biome catches inline `style={{}}` literals if a regex rule is added (TODO once we have first inline-style violation as evidence).
- `pnpm typecheck` — TypeScript catches missing variants / unknown theme names.
- `pnpm --filter @weave/web build` — Vite catches missing token references (the build output should never reference undefined CSS variables).

## Where to look

- Tokens: `packages/design-system/src/tokens.css`
- Components: `packages/design-system/src/components/`
- Theme switcher: `packages/design-system/src/components/ThemeSwitcher.tsx`
- Public guide: `packages/design-system/README.md`
- Feature guide (this folder): `README.md`

## Anti-patterns to call out in code review

- `<button className="bg-blue-500 ...">` — inline lookalike. Use `<Button>`.
- `style={{ color: "#FF6B35" }}` — hard-coded color. Use `text-[color:var(--accent)]`.
- `transition: "all 0.3s ease"` — magic motion. Use `var(--motion-normal) var(--motion-spring-soft)`.
- Adding `variant="primary-light-with-blue-outline"` — variant name longer than 2 words is a smell.
- Patching `data-theme` outside the registered set.

## Related

- OS-root: `.claude/skills/design-system-triage/SKILL.md`, `docs/06-templates/DESIGN_REVIEW.md`, `docs/02-company-operating-system/END_TO_END_WORKFLOW.md` § Design System Triage.
- Project: `records/work-items/WI-002-design-system-foundation.md`, `records/decisions/DR-007-design-system-tooling.md`.
- Companion: `packages/design-system/README.md`.
