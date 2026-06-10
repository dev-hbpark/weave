// WI-024 Phase 19 — workspace landing page.
//
// Replaces the marketing-heavy landing with a working workspace:
//   1. "+ 새 디자인" CTA opens the new-design wizard.
//   2. A grid of every saved design (`weave.design.v5.*` keys) — click
//      to open at `/design/:id`, hover to see modified date + delete.
//   3. A resources panel listing every uploaded image / video so the
//      user can confirm what's stored and remove unwanted entries.

import {
  AuroraBg,
  Button,
  Card,
  CardEyebrow,
  CardTitle,
  IconPlay,
  Reveal,
  ThemePicker,
} from "@weave/design-system";
import { useState } from "react";
import { Link } from "react-router-dom";
import { NewDesignWizard } from "./new-design/NewDesignWizard.js";
import { useLandingDesigns } from "./use-landing-designs.js";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aspectLabel(width: number, height: number): string {
  // GCD-based simple aspect display — 1920×1080 → 16:9 etc.
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

export function LandingPage() {
  // Local UI state only — everything else is owned by the hook (Lens 1).
  const [wizardOpen, setWizardOpen] = useState(false);
  const { designs, resources, duplicatingId, refresh, duplicate, deleteDesign, deleteResource } =
    useLandingDesigns();

  return (
    <>
      <AuroraBg />
      <NewDesignWizard
        open={wizardOpen}
        onOpenChange={(next) => {
          setWizardOpen(next);
          // Wizard close after a navigation — refresh list when user
          // bounces back to the workspace.
          if (!next) void refresh();
        }}
      />

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
        <ThemePicker />
      </header>

      <main className="mx-auto max-w-[1100px] px-6 md:px-10 pt-12 md:pt-16 pb-24">
        <Reveal mode="entrance" as="section" y={14}>
          {/* AUDIT-003 V1 — color-contrast fix. The eyebrow is decorative
              text over the AuroraBg gradient. Two pieces of the fix:
                1. Bumped color from `--text-soft` (62%) to `--text-default`
                   (84%) so the legible contrast holds against any region
                   of the magenta / cyan / violet gradient blobs.
                2. Inline `style.backgroundColor` set on the <p> so
                   axe-core (and other scanners that cannot trace through
                   position:fixed sibling layers) resolve the effective
                   background. `--bg-page` matches the body background
                   the AuroraBg paints over, so visually nothing changes;
                   the eyebrow still shows the aurora through it because
                   --bg-page itself is the same dark ink as the body. */}
          <p className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--text-default)] mb-5">
            Workspace
          </p>
          <h1 className="text-[clamp(36px,5vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em] text-[color:var(--text-strong)]">
            내 디자인
          </h1>
          <p className="mt-4 text-[16px] text-[color:var(--text-default)] max-w-[640px]">
            저장된 디자인을 다시 열거나, 새로 시작하거나, 업로드한 이미지/비디오를 확인할 수 있어요.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              trailingIcon={<span aria-hidden>→</span>}
              onClick={() => setWizardOpen(true)}
              data-testid="landing-new-design"
            >
              새 디자인 시작
            </Button>
          </div>
        </Reveal>

        {/* Saved designs grid */}
        <section className="mt-12" data-testid="workspace-designs">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[color:var(--text-strong)]">
              저장된 디자인
              <span className="ml-2 text-[14px] text-[color:var(--text-soft)] font-normal">
                {designs.length}
              </span>
            </h2>
          </div>
          {designs.length === 0 ? (
            <Card tone="default">
              <p className="text-[14px] text-[color:var(--text-soft)]">
                아직 저장된 디자인이 없어요. 위의 "새 디자인 시작" 버튼으로 만들어 보세요.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {designs.map((d) => (
                <Reveal key={d.id} delay={0.05}>
                  <div data-testid="design-card" data-design-id={d.id} className="group relative">
                    <Link to={`/design/${d.id}`} className="block no-underline">
                      <Card tone="raised" className="h-full">
                        {/* Thumbnail surface — paints the design's background
                            color so the user at least recognises tone. */}
                        <div
                          aria-hidden
                          className="aspect-[16/9] -mx-5 -mt-5 mb-4 rounded-t-[var(--radius-md)] border-b border-[color:var(--surface-1-border)] overflow-hidden"
                          style={{ background: d.background }}
                        >
                          <div className="h-full w-full flex items-center justify-center">
                            <span
                              className="text-[14px] uppercase tracking-[0.16em] font-mono opacity-30"
                              style={{
                                color:
                                  d.background.toLowerCase() === "#ffffff" ||
                                  d.background === "white"
                                    ? "#1f2933"
                                    : "rgba(255,255,255,0.7)",
                              }}
                            >
                              {aspectLabel(d.width, d.height)}
                            </span>
                          </div>
                        </div>
                        <CardTitle>{d.title}</CardTitle>
                        <CardEyebrow>
                          {d.width}×{d.height} · 마지막 수정 {formatDate(d.updatedAt)}
                        </CardEyebrow>
                      </Card>
                    </Link>
                    {/* Hover actions — Duplicate + Delete. Both live
                        OUTSIDE the Link so a click doesn't navigate. The
                        cluster sits in the top-right; visibility ties to
                        the parent card's hover so the chrome stays out
                        of the way until the user reaches for it.
                        Duplicate flow goes through `duplicateDesignCloud`
                        — cloud-only, no localStorage. */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        data-testid="design-duplicate"
                        disabled={duplicatingId !== null}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void duplicate(d);
                        }}
                        className="bg-[color:var(--surface-overlay)] border border-[color:var(--surface-overlay-border)] text-[12px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] disabled:opacity-50 disabled:cursor-progress rounded-[var(--radius-sm)] px-2 py-1"
                        aria-label="디자인 복제"
                      >
                        {duplicatingId === d.id ? "복제 중…" : "복제"}
                      </button>
                      <button
                        type="button"
                        data-testid="design-delete"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm(`"${d.title}" 디자인을 삭제할까요?`)
                          ) {
                            return;
                          }
                          deleteDesign(d.id);
                        }}
                        className="bg-[color:var(--surface-overlay)] border border-[color:var(--surface-overlay-border)] text-[12px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] rounded-[var(--radius-sm)] px-2 py-1"
                        aria-label="디자인 삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* Resources panel */}
        <section className="mt-12" data-testid="workspace-resources">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[color:var(--text-strong)]">
              리소스
              <span className="ml-2 text-[14px] text-[color:var(--text-soft)] font-normal">
                {resources.length}
              </span>
            </h2>
            <p className="text-[12px] text-[color:var(--text-soft)]">
              미디어 추가 시 자동으로 등록됩니다
            </p>
          </div>
          {resources.length === 0 ? (
            <Card tone="default">
              <p className="text-[14px] text-[color:var(--text-soft)]">
                업로드한 이미지나 비디오가 아직 없어요. 디자인 안에서 미디어를 추가하면 여기에도
                표시됩니다.
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {resources.map((r) => (
                <div
                  key={r.id}
                  data-testid="resource-card"
                  data-resource-id={r.id}
                  data-resource-kind={r.kind}
                  data-resource-session-only={r.sessionOnly ? "true" : "false"}
                  className="group relative aspect-square rounded-[var(--radius-md)] border border-[color:var(--surface-1-border)] bg-[color:var(--surface-1)] overflow-hidden"
                >
                  {r.kind === "image" ? (
                    <img src={r.src} alt={r.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/40 text-[color:var(--text-strong)]">
                      <div className="text-center">
                        <div className="flex justify-center" aria-hidden>
                          <IconPlay size={28} />
                        </div>
                        <div className="text-[11px] mt-1 text-white/80 break-all px-2">
                          {r.name}
                        </div>
                      </div>
                    </div>
                  )}
                  {r.sessionOnly ? (
                    <span className="absolute top-1 left-1 bg-black/55 text-white text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded">
                      이번 세션만
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="resource-delete"
                    onClick={() => {
                      deleteResource(r.id);
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/55 text-white text-[11px] leading-none rounded px-1.5 py-1"
                    aria-label="리소스 삭제"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {r.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
