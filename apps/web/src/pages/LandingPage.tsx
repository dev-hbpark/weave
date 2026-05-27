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
  Reveal,
  ThemeSwitcher,
} from "@weave/design-system";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bootstrapFromCloud } from "../document/cloud-sync.js";
import { listResources, type MediaResource, removeResource } from "../document/resource-storage.js";
import { clearDesign, type DesignSummary, listAllDesigns } from "../document/storage.js";
import { NewDesignWizard } from "./new-design/NewDesignWizard.js";

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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [designs, setDesigns] = useState<ReadonlyArray<DesignSummary>>([]);
  const [resources, setResources] = useState<ReadonlyArray<MediaResource>>([]);

  const refresh = useCallback(() => {
    setDesigns(listAllDesigns());
    setResources(listResources());
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Paint instantly with whatever localStorage already has, then pull
    // the shared cloud workspace and re-paint. The bootstrap is idempotent
    // (it skips ids already in LS) so re-running it from here in addition
    // to App.tsx's mount is safe.
    refresh();
    void bootstrapFromCloud().then(({ designs: d, resources: r }) => {
      if (cancelled) return;
      if (d > 0 || r > 0) refresh();
    });
    // Same-tab `localStorage.setItem` doesn't dispatch `storage`; this
    // listener only catches *cross-tab* updates (e.g. another window
    // saves a design). Same-tab refresh after bootstrap is handled above.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null) return;
      if (e.key.startsWith("weave.design.v5.") || e.key.startsWith("weave.resource.v1.")) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return (
    <>
      <AuroraBg />
      <NewDesignWizard
        open={wizardOpen}
        onOpenChange={(next) => {
          setWizardOpen(next);
          // Wizard close after a navigation — refresh list when user
          // bounces back to the workspace.
          if (!next) refresh();
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
        <ThemeSwitcher />
      </header>

      <main className="mx-auto max-w-[1100px] px-6 md:px-10 pt-12 md:pt-16 pb-24">
        <Reveal mode="entrance" as="section" y={14}>
          <p className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--text-soft)] mb-5">
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
                    {/* Delete button — appears on hover. Lives OUTSIDE the
                        Link so the click doesn't navigate. */}
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
                        clearDesign(d.id);
                        refresh();
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[color:var(--surface-overlay)] border border-[color:var(--surface-overlay-border)] text-[12px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] rounded-[var(--radius-sm)] px-2 py-1"
                      aria-label="디자인 삭제"
                    >
                      ×
                    </button>
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
                        <div className="text-[28px]" aria-hidden>
                          ▶
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
                      removeResource(r.id);
                      refresh();
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
