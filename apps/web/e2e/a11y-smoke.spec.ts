// LG-001 + LG-002 — Accessibility smoke (WCAG 2.2 AA).
//
// This spec is the automatable portion of the accessibility audit that LG-001
// (text v1) and LG-002 (figma frame UX) both list as a T-0 blocker. A full
// human audit is still recommended, but axe-core covers the rules an automated
// scan can verify reliably — colour contrast, landmark structure, ARIA usage,
// keyboard reachability hints, name/role/value of interactive elements, etc.
//
// Severity policy:
//   - critical / serious  → launch blocker. Must be fixed or explicitly
//                           accepted via design-system-triage with a written
//                           waiver in records/design-reviews/.
//   - moderate            → follow-up PR before T-0 + 1 week. Logged in the
//                           LG's "post-launch open items" list.
//   - minor               → tracked in backlog, not launch-blocking.
//
// The two T-0 flows scanned here:
//   1. Landing page (entry surface for every user).
//   2. Design page (the main editor) with a text item selected — covers the
//      text editing flow (LG-001) and the frame selection toolbar (LG-002).
//
// Run: `pnpm --filter @weave/web exec playwright test apps/web/e2e/a11y-smoke.spec.ts`
// (the regular `pnpm e2e` also picks it up).

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Severity buckets returned by axe-core, in ascending order. */
type AxeImpact = "minor" | "moderate" | "serious" | "critical";

interface SeverityCount {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

function countBySeverity(violations: ReadonlyArray<{ impact?: string | null }>): SeverityCount {
  const c: SeverityCount = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) {
    const k = (v.impact ?? "minor") as AxeImpact;
    c[k] += 1;
  }
  return c;
}

function describeViolations(
  violations: ReadonlyArray<{
    id: string;
    impact?: string | null;
    description: string;
    helpUrl: string;
    nodes: ReadonlyArray<{ target: ReadonlyArray<unknown>; html?: string }>;
  }>,
): string {
  return violations
    .map((v) => {
      const target = v.nodes[0]?.target?.join(" ") ?? "(no node)";
      const html = v.nodes[0]?.html ?? "";
      const htmlPreview = html.slice(0, 280);
      return `  - [${v.impact ?? "?"}] ${v.id}: ${v.description}\n      first: ${target}\n      html: ${htmlPreview}${html.length > 280 ? "…" : ""}\n      help: ${v.helpUrl}`;
    })
    .join("\n");
}

test.describe("a11y smoke — WCAG 2.2 AA", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllDesigns(page);
  });

  // AUDIT-003 (2026-05-28) — known serious violation V1 (color-contrast on
  // `.uppercase` eyebrow at LandingPage.tsx:190 using `--text-soft` token).
  // Re-enable as `test(...)` once the token is tightened or the eyebrow is
  // re-coloured. See records/audits/AUDIT-003-2026-05-28-a11y-smoke-wcag22aa.md.
  test("landing page passes axe-core with no critical/serious violations", async ({ page }) => {
    await page.goto("/");
    // Wait for landing chrome to settle so axe scans the real surface.
    await page.getByTestId("landing-new-design").waitFor({ state: "visible" });

    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const counts = countBySeverity(result.violations);
    if (counts.critical + counts.serious > 0) {
      console.log(`\n[a11y landing] ${describeViolations(result.violations)}`);
    }
    // Launch blocker bar: zero critical, zero serious.
    expect(
      counts.critical,
      `landing page has ${counts.critical} critical violations`,
    ).toBe(0);
    expect(
      counts.serious,
      `landing page has ${counts.serious} serious violations`,
    ).toBe(0);
  });

  // AUDIT-003 (2026-05-28) — known serious violation V2 (nested-interactive
  // on a `.group` wrapper somewhere in the FrameStage / QuickActionBar
  // surface). Re-enable as `test(...)` once the nesting is restructured.
  // See records/audits/AUDIT-003-2026-05-28-a11y-smoke-wcag22aa.md.
  test("design page (frame + text) passes axe-core with no critical/serious violations", async ({ page }) => {
    await prepareDesign(page, { flavor: "mixed", presetId: "16:9", title: "a11y smoke" });

    // Add a frame (LG-002 surface: frame UX). prepareDesign lands on an
    // empty design, so we exec addFrame to render the FrameStage + chrome.
    await addFrame(page, "frame", {
      frame: { x: 0.15, y: 0.15, width: 0.6, height: 0.6, rotation: 0 },
    });
    await page.waitForSelector("[data-frame-id]", { state: "visible", timeout: 10_000 });

    // Allow toolbar / selection chrome to settle.
    await page.waitForTimeout(300);

    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const counts = countBySeverity(result.violations);
    if (counts.critical + counts.serious > 0) {
      console.log(`\n[a11y design+frame] ${describeViolations(result.violations)}`);
    }
    expect(
      counts.critical,
      `design page (frame) has ${counts.critical} critical violations`,
    ).toBe(0);
    expect(
      counts.serious,
      `design page (frame) has ${counts.serious} serious violations`,
    ).toBe(0);
  });

  test("design page (empty design) passes axe-core with no critical/serious violations", async ({ page }) => {
    await prepareDesign(page, { flavor: "mixed", presetId: "16:9", title: "a11y empty" });
    // Empty design — no frames added. Covers the empty-state surface.
    await page.waitForTimeout(500);

    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const counts = countBySeverity(result.violations);
    if (counts.critical + counts.serious > 0) {
      console.log(`\n[a11y design+empty] ${describeViolations(result.violations)}`);
    }
    expect(
      counts.critical,
      `design page (empty) has ${counts.critical} critical violations`,
    ).toBe(0);
    expect(
      counts.serious,
      `design page (empty) has ${counts.serious} serious violations`,
    ).toBe(0);
  });
});
