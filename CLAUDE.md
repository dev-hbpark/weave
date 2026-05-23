# CLAUDE.md — weave

## Purpose

Self-contained service project inside the Service Excellence workspace.

## Project-local context rule

All project-specific documents must stay inside this repository.

## Path anchoring

Every relative path in this file (`docs/...`, `features/...`, `packages/...`, `apps/...`, `records/...`) resolves against **this project root** (`workspace/weave/`), never against the workspace OS root or the current shell `cwd`. The OS-root counterparts are named `WORKSPACE_*` to avoid collisions; if you see a `PROJECT_*` filename, it is always project-anchored.

## Progressive navigation

1. Read this file.
2. Read this project's `docs/00-navigation/PROJECT_MAP.md` (project-root anchored, not the OS-root `WORKSPACE_MAP.md`).
3. Read nearest folder `CLAUDE.md`.
4. Read nearest folder `RULE.md`.
5. Read relevant feature/record docs only.

## Workflow

The canonical 13 steps (identical to the OS-root `CLAUDE.md` "Default Workflow" and `docs/02-company-operating-system/END_TO_END_WORKFLOW.md`):

Work Item → Product Discovery → **Technical Feasibility Review** → Risk & Governance Review → Engineering Plan → Build → **Continuous Self-Verification** → QA / Verification → Launch Gate → Operations Monitoring → Incident / Feedback → Iteration → Agent / Skill Evaluation

Do not redefine this list. Extend with sub-bullets if needed.

For Technical Feasibility Review: see `.claude/skills/technical-feasibility-review/SKILL.md` (OS-root) and the verdict matrix at `docs/06-templates/FEASIBILITY_REVIEW.md`. Output saved at `records/feasibility-reviews/FR-<NNN>-<slug>.md` of this project.

For UI work, **Design System Triage** is a Build (step 6) sub-step that runs before any component is added or modified. The design system lives at `packages/design-system/` (`@weave/design-system`) — every UI touch must walk the decision tree (reuse / extend / grow / escape) against that package, not against app-local CSS. Steps 3-5 of the tree (new primitive / new token / new theme) and any public-facing surface trigger design-team collaboration via `records/design-reviews/DR-design-<NNN>-<slug>.md`. See `.claude/skills/design-system-triage/SKILL.md` (OS-root), the template at `docs/06-templates/DESIGN_REVIEW.md`, the project-anchored feature guide at `features/design-system/README.md`, and the feature rules at `features/design-system/RULE.md`.

## Feature-local rule

Feature-level work should be possible mostly from `features/<feature>/`.

## Document mutation rule — every change goes through History

**Any code that mutates the document MUST route through `editor.exec("weave.<verb>", input)`** so it produces a real `Patch`, flows through the editor's `ChangeStream`, and lands in `editor.history` as an undoable transaction. No `setAgoDoc` (or downstream-direct mutator) calls outside `useDocument` / the `applyChange` reducer.

Practical shape:

1. UI event handler → `editor.exec("weave.X", { ... })`.
2. Command's `run(ctx, input)` reads `ctx.document`, computes the `Patch[]` (or stages a new Item via `PendingCreations` for `item.children`), and returns `ok(value, patches)`.
3. `TransactionRunner` emits `Change`s on the `ChangeStream` with `user-command` origin.
4. The subscriber wired in `useWeaveEditor` calls `applyChange(change, pending)` → `applyChangeToDocument` → `setAgoDoc(next)`.
5. `editor.history` records the entry. `Cmd+Z` replays the inverse with `system` origin; same reducer applies. Same for `Cmd+Shift+Z`.

If a new mutation surface is being added (a new SelectionLayer handle, a plugin button, a hotkey action, a keyboard shortcut, a remote sync, anything that changes doc state), check:

- [ ] There is a `weave.<verb>` Command for it (or the existing one fits)
- [ ] The Command computes a real `Patch` (or stages the Item shape for `item.children`)
- [ ] The UI calls `editor.exec(...)`, never `setAgoDoc` / `targetsRef.X` directly
- [ ] An e2e test covers `Cmd+Z` reverting that mutation, and `Cmd+Shift+Z` re-applying it
- [ ] For high-frequency mutations (drag at 60 Hz), the patch's `mergeKey` collapses them into one undo step within `historyMergeWindowMs`; otherwise emit a single end-of-gesture patch

The History contract is: **a user can always undo what they just did**. The reverse — direct state mutation that bypasses commands — is a regression and must be caught at PR review or by the SVL gate (e2e under `apps/web/e2e/history-*.spec.ts`).

Cross-references: WI-013 (Phase 4b/5/7/8) for the migration log; `apps/web/src/document/commands.ts` for the command set; `apps/web/src/document/use-weave-editor.ts` for the proxy that fan-outs through `editor.exec`.

## Project-local agents, skills, commands

This project may carry its own domain-specialist agents, skills, and commands in addition to the OS-root ones:

```
.claude/
  agents/      domain-specialist agents (union with OS-root agents)
  skills/      domain-specific skills (union with OS-root skills)
  commands/    domain-specific slash commands (union with OS-root commands)
```

Discovery: Claude Code unions OS-root `.claude/` and this project's `.claude/` when the working directory is inside this project. Same-name entries in the project override the OS-root version (closer wins).

**Preferred way to populate this folder: `/bootstrap-domain`.**

Once this project has accumulated some material (at minimum a one-paragraph product description; ideally ≥ 3 record-clusters across `records/work-items/` + `records/decisions/` + `records/risks/`), run:

```
/bootstrap-domain
```

This invokes `domain-architect-agent` (OS-root), which reads this project's actual records and product docs, identifies recurring decision-class clusters, and writes 3–5 specialists into `.claude/{agents,skills,commands}/` plus a domain guide at `docs/domain/<DOMAIN>_DOMAIN_GUIDE.md`. It cites the records that justified each specialist's creation.

Re-run quarterly with `/bootstrap-domain --refresh` — additions are made, retirements move files to `.claude/_retired/`, updates extend bodies as scope widens.

See `docs/domain/DOMAIN.md` for the bootstrap history.

To hand-author instead:

1. Drop a file into `.claude/{agents,skills,commands}/` following the same shape as OS-root entries.
2. Run `python tools/validate_workspace.py` from the OS root — it lints project-local `.claude/` too.
3. Reference the new agent in `docs/00-navigation/PROJECT_MAP.md` so future contributors find it.
