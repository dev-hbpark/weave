# Project Map — weave

All paths in this file are anchored at this project root (`workspace/weave/`). Do not resolve them against the workspace OS root. For OS-level navigation see the OS-root `docs/00-navigation/WORKSPACE_MAP.md`.

## Feature work
Read:
- `features/CLAUDE.md`
- `features/<feature>/CLAUDE.md`
- `features/<feature>/RULE.md`
- feature records

## Engineering
Read:
- `docs/engineering/CLAUDE.md`
- `packages/CLAUDE.md`
- nearest package `CLAUDE.md`
- nearest package `RULE.md`
- feature `ENGINEERING_PLAN.md`

## Governance
Read:
- `docs/governance/CLAUDE.md`
- feature `RISK_NOTES.md`

## Launch
Read:
- `docs/launch/CLAUDE.md`
- `docs/launch/LAUNCH_GATE.md`
- feature `QA_PLAN.md`

## Domain specialists (project-local)
Read:
- `docs/domain/DOMAIN.md` — which preset bootstrapped this project
- `docs/domain/<DOMAIN>_DOMAIN_GUIDE.md` — what the project-local specialists know
- `.claude/agents/*.md` — domain-specialist agents (in addition to OS-root agents)
- `.claude/skills/*/SKILL.md` — domain-specific skills
- `.claude/commands/*.md` — domain-specific slash commands

These are unioned with the OS-root agents/skills/commands. Closer-wins on name conflict.
