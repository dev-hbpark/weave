import {
  AuroraBg,
  Button,
  Card,
  CardEyebrow,
  CardTitle,
  Reveal,
  ThemeSwitcher,
} from "@weave/design-system";
import { useState } from "react";
import { Link } from "react-router-dom";
import { NewDesignWizard } from "./new-design/NewDesignWizard.js";

const status: ReadonlyArray<{ label: string; value: string; accent?: boolean }> = [
  { label: "WI-001 service kickoff", value: "In Progress" },
  { label: "FR-001 feasibility verdict", value: "FEASIBLE WITH TRADE-OFFS", accent: true },
  { label: "DR-001 agocraft dep", value: "Accepted · Option E (private npm + yalc)" },
  { label: "WI-002 design system", value: "In Progress · this page", accent: true },
  { label: "WI-003 first prototype", value: "In Progress · /doc/demo", accent: true },
  { label: "HANDOFF-001 → agocraft", value: "Open — awaiting publish setup" },
];

const milestones: ReadonlyArray<{ id: string; date: string; title: string }> = [
  { id: "M0", date: "~2026-06-05", title: "DR-002~005 verdict · 사용자 인터뷰 ≥ 10" },
  { id: "M1", date: "~2026-06-26", title: "한 doc 안 4 도메인 임베드 + localStorage" },
  { id: "M2", date: "~2026-07-24", title: "Multi-tenant + closed beta n=20" },
  { id: "M3", date: "~2026-08-14", title: "Retention 측정 + critical bug fix" },
  { id: "M4", date: "~2026-08-31", title: "Open beta + template + blog + landing" },
];

export function LandingPage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <AuroraBg />
      <NewDesignWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      <header className="px-6 md:px-10 pt-6 md:pt-10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <span
            aria-hidden
            className="inline-block w-6 h-6 rounded-[var(--radius-sm)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)]"
          />
          <span className="text-[18px] font-semibold tracking-tight text-[color:var(--text-strong)]">
            weave
          </span>
        </Link>
        <ThemeSwitcher />
      </header>

      <main className="mx-auto max-w-[920px] px-6 md:px-10 pt-16 md:pt-24 pb-24">
        <Reveal mode="entrance" as="section" y={14}>
          <p className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--text-soft)] mb-5">
            Multi-domain workspace · B2B
          </p>
          <h1 className="text-[clamp(48px,8vw,84px)] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--text-strong)]">
            One canvas.
            <br />
            <span className="bg-clip-text text-transparent bg-[image:var(--accent-gradient)]">
              Four worlds woven.
            </span>
          </h1>
          <p className="mt-6 text-[18px] md:text-[20px] text-[color:var(--text-default)] max-w-[640px]">
            Slides, free canvas, block-docs, and rich media — in a single document your team can
            edit, share, and showcase. Built on the agocraft engine.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              trailingIcon={<span aria-hidden>→</span>}
              onClick={() => setWizardOpen(true)}
              data-testid="landing-new-design"
            >
              Start a new design
            </Button>
          </div>
        </Reveal>

        <section className="mt-20 grid gap-6 md:grid-cols-2">
          <Reveal>
            <Card tone="raised">
              <CardEyebrow>M0 status — 2026-05-22</CardEyebrow>
              <CardTitle>What's already woven</CardTitle>
              <ul className="mt-5 space-y-3">
                {status.map((s) => (
                  <li key={s.label} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={
                        s.accent
                          ? "mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] shadow-[var(--shadow-glow)]"
                          : "mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--text-muted)]"
                      }
                    />
                    <div className="flex-1">
                      <div className="text-[13px] text-[color:var(--text-soft)] uppercase tracking-[0.08em]">
                        {s.label}
                      </div>
                      <div className="text-[15px] text-[color:var(--text-strong)] mt-0.5">
                        {s.value}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>

          <Reveal delay={0.08}>
            <Card tone="raised">
              <CardEyebrow>Roadmap — 90 days</CardEyebrow>
              <CardTitle>Next milestones</CardTitle>
              <ol className="mt-5 space-y-3.5">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-baseline gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent-strong)] min-w-[28px]">
                      {m.id}
                    </span>
                    <span className="text-[11px] text-[color:var(--text-muted)] font-mono min-w-[90px]">
                      {m.date}
                    </span>
                    <span className="text-[14px] text-[color:var(--text-default)] flex-1">
                      {m.title}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </Reveal>
        </section>

        <section className="mt-16">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)] mb-3">
            Design system · WI-002 + WI-003
          </div>
          <p className="text-[14px] text-[color:var(--text-soft)] max-w-[640px]">
            Aurora theme, premium glass + gradient. Switch the segmented control above to see Mono
            (Linear-grade) and Vivid (max playful) — both built from the same 3-layer token system,
            cross-faded via the View Transitions API. All motion respects{" "}
            <code className="text-[color:var(--text-strong)]">prefers-reduced-motion</code>. The new{" "}
            <code className="text-[color:var(--text-strong)]">--domain-*-accent</code> tokens
            (DR-design-001) drive the demo doc.
          </p>
        </section>
      </main>
    </>
  );
}
