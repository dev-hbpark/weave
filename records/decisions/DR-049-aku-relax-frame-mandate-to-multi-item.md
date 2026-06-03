# DR-049 — Aku: relax the nested-frame mandate to multi-item grouping only

- **Date:** 2026-06-03 · **Status:** Accepted
- **Relates:** DR-038 (aku text placement — layout-owns-fit; **this relaxes its frame mandate**), DR-028-present-mode/DR-028 per-frame slide membership (`presentable`)
- **Host counterpart:** small-think **DR-028** (design-agent prompt/critique/profiles)

## Context

DR-038 aligned weave's advertised capabilities with small-think's "frame layout owns fit"
paradigm and, in its hardening pass, made nested layout frames **MANDATORY** in
`WEAVE_DOMAIN_KNOWLEDGE` rule 0 ("build EVERY slide's structure from them") and called
nested frames the agent's "PRIMARY LAYOUT TOOL" in the `frame` itemKind description.

That cured the agent hand-placing whole clusters by coordinate, but it over-shot: the
agent now wraps **single items and one-element regions** in their own layout frames just to
satisfy the per-region mandate, producing single-child wrapper frames and over-deep,
hard-to-edit frame trees. Operator feedback flagged the frame over-use directly.

## Decision

Reframe nested frames as the tool for **grouping multiple items**, not a mandatory wrapper:

- A nested layout frame is for **aligning / auto-arranging MULTIPLE related items (2+), or
  making a region reflow as a unit** — it must earn its place by doing real layout work.
- **A single item (or one-element region) is placed directly — no wrapper frame.** A
  single-child frame adds nesting with no layout value.
- The defect to avoid is hand-placing a **cluster** of related content by coordinate so it
  drifts out of alignment — group those. A lone well-placed item or a deliberately simple
  slide is fine; over-nesting to satisfy a rule is itself a defect.
- Single coloured panel / divider / button → a `shape` rectangle, never a frame (unchanged,
  re-emphasised).

## Scope (edits)

- `apps/web/src/features/aku/agent/weave-capabilities.ts`
  - `frame` itemKind description — "PRIMARY LAYOUT TOOL" → "LAYOUT TOOL FOR GROUPING";
    added the single-child prohibition and the cluster-vs-lone-item distinction.
  - `WEAVE_DOMAIN_KNOWLEDGE` rule 0 — "NESTED LAYOUT FRAMES ARE MANDATORY / build EVERY
    slide's structure from them" → "…use them WHERE THEY EARN THEIR PLACE"; procedure scoped
    to regions grouping 2+ items; explicit "place a single item directly" + "do not over-nest".

`weave.frame.setLayout` / `presentable:false` / TABLES-ARE-GRIDS rules are unchanged. No
behavioural code change — this is advertised-capability prompt text consumed by the
small-think design agent's cached system prompt.

## Consequences

- Shallower frame trees; frames in generated decks signal genuine grouping.
- The DR-038 anti-pattern (hand-placed clusters) is still discouraged; lone items and simple
  layouts are no longer force-wrapped.
