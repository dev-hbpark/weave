# Agent Evaluation — <ID>

| Field | Value |
|---|---|
| ID | AGENT_EVALUATION-<NNN> |
| Date | YYYY-MM-DD |
| Author | <agent or person> |
| Scope | <single agent / single skill / routing table / weekly snapshot / incident-driven> |
| Triggering event | <weekly review / incident / routing change / scheduled audit> |

## Subjects reviewed

- agent: `<agent-name>`
- skill: `<skill-name>`
- routing entry: `<category>` in `docs/00-navigation/AGENT_ROUTING_TABLE.md`

## Observations

What the agent/skill produced. Cite specific records (DR-*, RISK-*, HANDOFF-*, WI-*) where possible.

## Quality assessment

- Specific to task type: <yes / partial / no>
- Actionable output: <yes / partial / no>
- Traceable to records: <yes / partial / no>
- Rule-compliant (RULE.md / CLAUDE.md / skill bar): <yes / partial / no>
- Token efficiency: <yes / acceptable / wasteful>

## Failure modes (if any)

- <symptom> — <root cause hypothesis> — <evidence>

## Recommendations

- [ ] Update agent definition at `.claude/agents/<name>.md` (specify what)
- [ ] Update skill at `.claude/skills/<name>/SKILL.md` (specify what)
- [ ] Update routing entry (specify category and change)
- [ ] No change — keep monitoring

## Follow-up Work Item

If recommendations require code/doc changes, link the resulting Work Item ID here.
