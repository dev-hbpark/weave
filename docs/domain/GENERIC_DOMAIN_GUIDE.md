# Domain Guide — generic

This project was bootstrapped without a specific domain preset. It relies entirely on the OS-root 65 agents / 23 skills / 25 commands.

## When this is the right choice

- The project's domain isn't covered by an existing preset (`templates/domain-presets/`).
- The project is exploratory or generic — no recurring domain-specific decisions yet.
- Domain specialists will be authored ad-hoc as patterns emerge.

## When to upgrade to a domain preset

Move from `generic` to a domain preset when:

- The project keeps invoking the same risk / decision pattern that the OS-root agents cover only in general terms.
- The same vocabulary, regulation, or trade-off keeps coming up (e.g., "every feature touches HIPAA" → adopt `healthtech`).
- Multiple Decision Records (DR-*) cite the same unwritten domain knowledge.

To switch, either:

1. Copy the relevant preset folders from `templates/domain-presets/<preset>/` into `workspace/<project>/`, OR
2. Recreate the project with `--domain <preset>` and migrate records.

## How to add a single project-local specialist without a full preset

- Drop a single agent at `.claude/agents/<name>-agent.md` following the OS-root agent shape (frontmatter + sections).
- Drop a skill at `.claude/skills/<name>/SKILL.md`.
- Drop a command at `.claude/commands/<name>.md`.
- Reference the new specialist in `docs/00-navigation/PROJECT_MAP.md`.
- Run `python tools/validate_workspace.py` from the OS root.

See `templates/domain-presets/README.md` for the meta-guide on authoring a new domain preset.
