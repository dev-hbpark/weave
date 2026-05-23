# Records

Project-level records. Feature-level records live in feature folders.

## Folder index

| Folder | Purpose | Who writes here |
|---|---|---|
| `decisions/` | Decision Records (`DR-<NNN>-<slug>.md`). Final outcome of any cross-team or governance decision. | `decision-arbitrator` after a council/arbitration; any team for a Level-1/2 decision. |
| `feasibility-reviews/` | Technical Feasibility Review records (`FR-<NNN>-<slug>.md`). Verdict on whether a requested outcome is buildable with current state of the art, with trade-offs and scope-reduction options. | `technical-feasibility-agent`; mandatory for new projects, new domains, AI / platform-pushing features. |
| `handoffs/` | **Intra-project** handoffs (`HANDOFF-<NNN>-<slug>.md`). Team A inside this project asks Team B inside this project to act. | `decision-router` or any team that needs to delegate work to another team in the same project. |
| `decision-handoffs/` | **Cross-project inbox.** Other projects write handoff files **here** when they need something from us. This is the only path the cross-project write hook (`tools/check_cross_project_write.py`) permits when `cwd` is inside a different project. | Other projects' `decision-router` agents. We pick them up and respond with our own Decision Record. |
| `risks/` | Risk reviews (`RISK-<NNN>-<slug>.md`). | `risk-governance-orchestrator` and specialist risk agents. |
| `work-items/` | Top-level work items (`WI-<NNN>-<slug>.md`) that span multiple features or are project-level. | Any team driving a project-level scope. |
| `launch-gates/` | Launch gate records per release (`LG-<NNN>-<slug>.md`). | `command-center-orchestrator` + `risk-governance-orchestrator` + `qa-release-validation-agent`. |
| `incidents/` | Incident records (`INC-<NNN>-<slug>.md`) and postmortems. | `incident-commander`. |
| `agent-quality/` | Agent / Skill / Routing evaluations (`AGENT_EVALUATION-<NNN>-<slug>.md`). See the template inside that folder. | `agent-performance-evaluator`, `skill-quality-reviewer`, `routing-table-optimizer`. |

## `handoffs/` vs `decision-handoffs/` — when to use which

```
Within this project (team A → team B, same project)
  → records/handoffs/HANDOFF-<NNN>.md

From a different project (project X needs something from us)
  → records/decision-handoffs/HANDOFF-<NNN>.md   ← they write, we read
```

If you are inside project A and need something from project B, write the handoff at `workspace/B/records/decision-handoffs/HANDOFF-<NNN>.md`. The cross-project write hook will only permit that single path; every other path inside project B will be blocked.

## Naming

Use a zero-padded sequential number, then a short kebab-case slug:

- `DR-007-pricing-tiers.md`
- `FR-002-realtime-translation.md`
- `HANDOFF-002-external-commitments-w2-w4.md`
- `RISK-004-data-retention.md`
- `LG-001-public-beta.md`
- `INC-001-checkout-500.md`
- `AGENT_EVALUATION-001-w20-snapshot.md`
