# HANDOFF-025 — (from small-think) register-aware restraint landed; weave can send a per-task register

- **Date:** 2026-06-06
- **From:** small-think (DR-043, in response to HANDOFF-024)
- **To:** weave owner (Aku agent)
- **Type:** response + request — the harness is now register-aware; weave may opt in by sending a register
- **Severity:** P3 (no weave change = no regression; the harness already stopped flattening
  expressive designs via the content-read path)

## What small-think did (DR-043)

The design harness no longer pushes restraint uniformly. Two parts:

1. **Baseline is register-adaptive (no action needed from weave).** The tone-manner block now
   says *"Match restraint to the register"* — restraint for sober/editorial, **confident
   saturation / scale / decoration for expressive/playful**, and the prune/reflow passes
   *"cut TEXT and clutter, never an expressive register's deliberate visual intensity"*
   (REDUCTION_TASK gained a "REGISTER GUARD"). The model already reads the register from
   content, so expressive designs stop being sanded down **even without any weave change**.

2. **Optional explicit register (weave can opt in).** The design-agent API now accepts a
   register, and when set it appends a per-register restraint clause to the system prompt and
   overrides the harness default:

   ```ts
   type DesignRegister = "sober" | "editorial" | "expressive" | "playful";
   // @small-think/design
   editDesign(instruction, ctx, { register?: DesignRegister, /* …profile, images, temperature */ })
   designFromContent(content, ctx, { register?: DesignRegister, … })
   ```

   `register` omitted → content-inferred (unchanged). Set → the harness commits to that
   register's restraint policy.

## Request to weave — send the register you already know

weave's DR-077 picks a tone preset (or samples axes) per generation, so it KNOWS the intended
mood better than the model can infer from content. Map the picked preset → a register and send
it, so the harness's restraint matches weave's input variety end-to-end.

**Suggested mapping (`TONE_PRESETS` → `DesignRegister`):**

| preset      | register     |
|-------------|--------------|
| `editorial` | `editorial`  |
| `minimal`   | `sober`      |
| `luxury`    | `sober`      |
| `bold`      | `expressive` |
| `retro`     | `expressive` |
| `warm`      | `expressive` |
| `playful`   | `playful`    |
| (자동/no preset) | omit → content-inferred |

A tiny `presetToRegister(presetId)` record in `compose-tone.ts` (Rule 6: a lookup, not a
switch) is the natural home; `undefined` for 자동.

## The remaining wiring (weave + client/server transport)

The register is accepted at the **design-agent API** (small-think side). It is NOT yet carried
over the reverse-MCP submit path. To deliver it end-to-end, three small hops are needed:

1. **weave** — `use-aku-agent.ts`: pass the chosen register alongside `temperature` in
   `handle.submit(task, { temperature, register, … })` (derive it via `presetToRegister`).
2. **@small-think/client** — thread the new submit option through the hello/submit frame into
   the server (same pattern as `temperature`).
3. **agent-server** — forward it into `editDesign/designFromContent`'s `DesignTaskOptions.register`.

Hops 2–3 are small-think's surface — if weave confirms it wants the explicit channel (vs.
relying on the content-read baseline, which already works), small-think will wire hops 2–3 and
reply with the exact option name. Until then, **no weave change is required** and expressive
designs already improve from part 1.

## Pointers
- small-think: DR-043; `packages/design/src/{harness,profiles,prompt,create-design-agent,review-tasks}.ts`;
  exports `DesignRegister`, `RESTRAINT_POLICIES`, `registerToneClause`.
- weave: DR-077; `features/aku/agent/compose-tone.ts` (`TONE_PRESETS`).
- Precedent for a per-submit option channel: `temperature` (already wired through submit).
