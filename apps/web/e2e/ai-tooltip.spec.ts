// AI Agentic Tooltip — Phase C e2e coverage.
//
// Real timers (vs vitest fake timers) — the project convention is "design-
// system test coverage via apps/web e2e" (packages/design-system/package.json's
// `test` script). These specs verify the user-visible timing behavior end-
// to-end against the live React + motion + portal pipeline.
//
// Test scenarios:
//   1. Show-delay debounce — brief hover doesn't open; ≥175 ms hover does.
//   2. Hide-buffer — leave + re-enter within 100 ms keeps the tooltip visible.
//   3. Dataset auto-discover — `[data-ai-tooltip="true"]` is picked up by the
//      provider without any hook/wrapper binding.
//   4. Region On/Off — explicit `data-tooltip-show-*="false"` hides the
//      corresponding region while leaving others intact.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

const TOOLTIP = "[data-ai-tooltip-surface]";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("show-delay debounce — hover under 175ms does not open the tooltip", async ({ page }) => {
  // The DesignPage toolbar Undo button is wrapped with <AITooltip> — perfect
  // hook-path target. We hover briefly and confirm no tooltip appears.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-A" });
  const undo = page.getByTestId("toolbar-undo");
  await undo.hover();
  // Sample at 100 ms (well under 175 ms) — tooltip should not be in the DOM.
  await page.waitForTimeout(100);
  await expect(page.locator(TOOLTIP)).toHaveCount(0);
  // Move away so the test doesn't leave a pending-show timer running.
  await page.mouse.move(0, 0);
});

test("show-delay debounce — hover past 175ms opens the tooltip", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-B" });
  const undo = page.getByTestId("toolbar-undo");
  await undo.hover();
  // Past the show delay — tooltip becomes visible.
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute("role", "tooltip");
  await expect(tip).toContainText("되돌리기");
});

test("hide-buffer — leaving and returning within 100ms keeps tooltip visible", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-C" });
  const undo = page.getByTestId("toolbar-undo");
  await undo.hover();
  await page.waitForTimeout(260);
  await expect(page.locator(TOOLTIP)).toBeVisible();
  // Leave and come back within the 100 ms hide buffer — the same tooltip
  // instance stays mounted.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(40);
  await undo.hover();
  // Sample later — still visible, no flicker through "idle".
  await page.waitForTimeout(60);
  await expect(page.locator(TOOLTIP)).toBeVisible();
  await expect(page.locator(TOOLTIP)).toHaveCount(1);
});

test("dataset auto-discover — [data-ai-tooltip] is picked up by the provider", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-D" });
  // Inject a tooltip target directly into the page. The App-root provider has
  // scan="dataset", so any element with [data-ai-tooltip="true"] should be
  // resolved by the document-level pointer handler.
  await page.evaluate(() => {
    const el = document.createElement("button");
    el.setAttribute("data-testid", "dataset-target");
    el.setAttribute("data-ai-tooltip", "true");
    el.setAttribute("data-tooltip-context", "계약서 문서");
    el.setAttribute(
      "data-tooltip-actions",
      JSON.stringify([
        { action: "클릭하여 바로 가기", shortcut: "Enter" },
        { action: "드래그하여 순서 정렬", shortcut: "⌥ + Drag" },
      ]),
    );
    el.style.position = "fixed";
    el.style.left = "100px";
    el.style.top = "300px";
    el.style.width = "120px";
    el.style.height = "32px";
    el.style.zIndex = "10";
    el.textContent = "dataset-target";
    document.body.appendChild(el);
  });

  await page.getByTestId("dataset-target").hover();
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("계약서 문서");
  await expect(tip).toContainText("클릭하여 바로 가기");
  await expect(tip).toContainText("드래그하여 순서 정렬");
  // Both shortcut keycaps render — verify the literal text.
  await expect(tip).toContainText("Enter");
  await expect(tip).toContainText("⌥ + Drag");
});

test("shared-element morph — adjacent target switch interpolates via transform", async ({
  page,
}) => {
  // Two dataset targets far apart. Open A, then hover B during the visible
  // state. Motion's `layout` should animate via a FLIP transform: at the
  // start of the morph the surface's transform is a non-identity translate
  // close to A's offset; partway through it's an intermediate value; at the
  // end it returns to `none`. Throughout, exactly one surface stays mounted.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-F" });
  await page.evaluate(() => {
    const make = (id: string, x: number, y: number, ctx: string) => {
      const el = document.createElement("button");
      el.setAttribute("data-testid", id);
      el.setAttribute("data-ai-tooltip", "true");
      el.setAttribute("data-tooltip-context", ctx);
      el.setAttribute(
        "data-tooltip-actions",
        JSON.stringify([{ action: "OK", shortcut: "Enter" }]),
      );
      el.style.position = "fixed";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = "120px";
      el.style.height = "32px";
      el.style.zIndex = "10";
      document.body.appendChild(el);
    };
    make("morph-A", 150, 400, "A");
    make("morph-B", 950, 600, "B");
  });

  await page.getByTestId("morph-A").hover();
  await page.waitForTimeout(260);
  await expect(page.locator(TOOLTIP)).toBeVisible();

  // Dispatch the pointerover transition AND sample in the same evaluate so
  // RAF starts capturing from the same animation frame the layout change is
  // scheduled. Splitting these into two evaluate calls adds ~30 ms of IPC,
  // which on a fast machine is enough for the 240 ms morph to be > halfway
  // done before sampling begins.
  const samples = await page.evaluate(async () => {
    const a = document.querySelector('[data-testid="morph-A"]');
    const b = document.querySelector('[data-testid="morph-B"]');
    if (!a || !b) return [] as Array<{ ms: number; tx: number; count: number }>;
    const ev = new PointerEvent("pointerover", {
      bubbles: true,
      relatedTarget: a,
      pointerType: "mouse",
    });
    Object.defineProperty(ev, "target", { value: b });
    b.dispatchEvent(ev);
    const out: Array<{ ms: number; tx: number; count: number }> = [];
    const start = performance.now();
    while (performance.now() - start < 400) {
      await new Promise((r) => requestAnimationFrame(r));
      const all = document.querySelectorAll("[data-ai-tooltip-surface]");
      const el = all[0] as HTMLElement | undefined;
      if (!el) continue;
      const cs = window.getComputedStyle(el).transform;
      let tx = 0;
      const m = cs.match(/matrix\(([^)]+)\)/);
      if (m?.[1]) {
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        tx = parts[4] ?? 0;
      }
      out.push({ ms: Math.round(performance.now() - start), tx, count: all.length });
    }
    return out;
  });

  // Exactly one surface throughout — no remount, no flicker.
  for (const s of samples) {
    expect(s.count, `count at t=${s.ms}ms`).toBe(1);
  }

  // Shape of the morph: starts with a large negative tx (FLIP back to A's
  // position), monotonically converges to 0. We assert two robust invariants:
  //   - peak |tx| during the morph is meaningful (> 100 px), proving the
  //     animation was actually running, not a snap.
  //   - the final tx is essentially 0 (settled).
  const peakTx = Math.max(...samples.map((s) => Math.abs(s.tx)));
  const finalTx = samples[samples.length - 1]?.tx ?? 0;
  expect(peakTx, "should observe interpolating transform > 100 px").toBeGreaterThan(100);
  expect(Math.abs(finalTx), "should settle at identity transform").toBeLessThan(2);
});

test("a11y — aria-describedby is wired, Escape dismisses without the hide buffer", async ({
  page,
}) => {
  // WAI-ARIA tooltip pattern surface contract: the bound target carries
  // `aria-describedby` pointing at the floating element's id, and Escape
  // dismisses without going through the accidental-leave hide buffer.
  //
  // Why not test `Locator.focus()` directly here: in headless Chromium the
  // synthetic React onFocus delegation is unreliable when the window has no
  // OS focus. The standalone smoke (run with a real dev server) confirms the
  // focus path opens the tooltip identically to hover. The two specs that
  // really matter — aria-describedby is set, and Escape immediate dismisses —
  // are exercised here via the hover path.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Kb" });
  await addFrame(page, "slide");

  const undo = page.getByTestId("toolbar-undo");
  await expect(undo).toBeEnabled();

  // aria-describedby is set whenever the binding mounts — independent of
  // whether the tooltip is currently visible. Screen readers walking the
  // target can resolve the relationship as soon as the surface appears.
  const describedBy = await undo.getAttribute("aria-describedby");
  expect(describedBy).toBe("weave-ai-tooltip-surface");

  // Open via hover so we can exercise Esc dismissal next.
  await undo.hover();
  await page.waitForTimeout(260);
  await expect(page.locator(TOOLTIP)).toBeVisible();

  // Escape removes the surface immediately — the 100 ms hide buffer is for
  // accidental leaves, not explicit dismissal. Sample at 30 ms (well under
  // the 100 ms buffer) to prove it's not going through pending-hide.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(30);
  await expect(page.locator(TOOLTIP)).toHaveCount(0);
});

test("reduced motion — morph snaps without transform interpolation", async ({ browser }) => {
  // Independent context so reducedMotion takes effect for the whole page life.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await clearAllDesigns(page);
  await prepareDesign(page, { flavor: "mixed", title: "Tip-RM" });
  await page.evaluate(() => {
    const make = (id: string, x: number, y: number) => {
      const el = document.createElement("button");
      el.setAttribute("data-testid", id);
      el.setAttribute("data-ai-tooltip", "true");
      el.setAttribute("data-tooltip-context", id);
      el.setAttribute("data-tooltip-actions", JSON.stringify([{ action: "OK" }]));
      el.style.position = "fixed";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = "120px";
      el.style.height = "32px";
      el.style.zIndex = "10";
      document.body.appendChild(el);
    };
    make("rm-A", 150, 400);
    make("rm-B", 950, 600);
  });
  await page.getByTestId("rm-A").hover();
  await page.waitForTimeout(260);
  await expect(page.locator(TOOLTIP)).toBeVisible();

  // Trigger morph and sample transforms via RAF. Under reduced-motion the
  // layout duration is zeroed → transform should never carry a non-trivial
  // translate (we allow a one-frame |tx|<=2 px tolerance for rounding).
  await page.evaluate(() => {
    const a = document.querySelector('[data-testid="rm-A"]');
    const b = document.querySelector('[data-testid="rm-B"]');
    if (!a || !b) return;
    const ev = new PointerEvent("pointerover", {
      bubbles: true,
      relatedTarget: a,
      pointerType: "mouse",
    });
    Object.defineProperty(ev, "target", { value: b });
    b.dispatchEvent(ev);
  });
  const samples = await page.evaluate(async () => {
    const out: Array<{ tx: number }> = [];
    const start = performance.now();
    while (performance.now() - start < 250) {
      await new Promise((r) => requestAnimationFrame(r));
      const el = document.querySelector("[data-ai-tooltip-surface]");
      if (!el) continue;
      const cs = window.getComputedStyle(el).transform;
      let tx = 0;
      const m = cs.match(/matrix\(([^)]+)\)/);
      if (m?.[1]) {
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        tx = parts[4] ?? 0;
      }
      out.push({ tx });
    }
    return out;
  });
  const maxTx = Math.max(...samples.map((s) => Math.abs(s.tx)));
  expect(maxTx).toBeLessThan(2);

  await ctx.close();
});

test("edge-flip — target near the viewport bottom flips the tooltip above", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Flip" });
  await page.evaluate(() => {
    const el = document.createElement("button");
    el.setAttribute("data-testid", "flip-target");
    el.setAttribute("data-ai-tooltip", "true");
    el.setAttribute("data-tooltip-context", "아래 가장자리 근처에 있음");
    el.setAttribute(
      "data-tooltip-actions",
      JSON.stringify([
        { action: "옵션 1", shortcut: "1" },
        { action: "옵션 2", shortcut: "2" },
        { action: "옵션 3", shortcut: "3" },
        { action: "옵션 4", shortcut: "4" },
      ]),
    );
    el.style.position = "fixed";
    // 4 px from the bottom of the viewport — bottom placement (8 px gap +
    // tooltip height) cannot fit, so Stage placement should flip above.
    el.style.left = "200px";
    el.style.bottom = "4px";
    el.style.width = "120px";
    el.style.height = "32px";
    el.style.zIndex = "10";
    document.body.appendChild(el);
  });
  await page.getByTestId("flip-target").hover();
  await page.waitForTimeout(260);
  const rects = await page.evaluate(() => {
    const target = document.querySelector('[data-testid="flip-target"]') as HTMLElement;
    const tip = document.querySelector("[data-ai-tooltip-surface]") as HTMLElement;
    const tr = target.getBoundingClientRect();
    const pr = tip.getBoundingClientRect();
    return { targetTop: tr.top, targetBottom: tr.bottom, tipTop: pr.top, tipBottom: pr.bottom };
  });
  // Tooltip should sit ABOVE the target — tipBottom <= targetTop (with gap).
  expect(rects.tipBottom).toBeLessThanOrEqual(rects.targetTop);
});

test("overlay surface — AITooltip stays theme-independent so it stays readable over any canvas", async ({
  page,
}) => {
  // The tooltip moved off the per-theme surface tokens onto the global
  // `--surface-overlay` (a dark glass shared by all themes). That's the
  // intentional change: floating chrome must stay readable over the user's
  // design canvas — which can be white, dark, or any color — regardless of
  // which UI theme is active. The asserted invariant inverts the prior one:
  // bg/border MUST be identical across all themes.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Th" });
  const tip = page.locator(TOOLTIP);
  const measure = async (theme: string) => {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.waitForTimeout(80);
    await page.getByTestId("toolbar-undo").hover();
    await page.waitForTimeout(260);
    await expect(tip).toBeVisible();
    const cs = await tip.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { bg: s.backgroundColor, border: s.borderTopColor };
    });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(150);
    return cs;
  };
  const aurora = await measure("aurora");
  const mono = await measure("mono");
  const vivid = await measure("vivid");

  expect(aurora.bg).toBe(mono.bg);
  expect(mono.bg).toBe(vivid.bg);
  expect(aurora.border).toBe(mono.border);
});

test("live data refresh — tooltip content updates in place when the bound data changes", async ({
  page,
}) => {
  // Mount a small test harness inside the page that lets us flip the
  // tooltip data while the surface is visible. The provider's refresh()
  // path must propagate the new content without a remount (no flicker
  // through `idle` / re-show delay).
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Refresh" });
  await page.evaluate(() => {
    // Two pre-defined dataset payloads. We swap them via attribute mutation
    // while the tooltip is open; the provider's dataset scan reads on every
    // pointerover, but for the *currently active* target it relies on the
    // refresh() path — so this test exercises that path specifically (the
    // dataset attributes don't auto-resync without a pointer event).
    //
    // We instead use the dataset path indirectly: the same element stays
    // mounted, attributes flip, and we manually fire one more pointerover
    // *with the same target* — provider sees same element, instant-switch
    // branch fires open() which (since visible) goes through the "visible
    // same target re-entering" path. To prove `refresh()` does its job
    // *without* a pointer event, we mutate via the hook-bound element by
    // toggling a re-render that supplies new describer data.
    //
    // Simpler / more direct: render a small dataset target whose attributes
    // we can rewrite, then fire a fresh pointerover after each rewrite.
    const el = document.createElement("button");
    el.setAttribute("data-testid", "refresh-target");
    el.setAttribute("data-ai-tooltip", "true");
    el.setAttribute("data-tooltip-context", "초기 컨텍스트");
    el.setAttribute(
      "data-tooltip-actions",
      JSON.stringify([{ action: "초기 액션", shortcut: "1" }]),
    );
    el.style.position = "fixed";
    el.style.left = "200px";
    el.style.top = "400px";
    el.style.width = "120px";
    el.style.height = "32px";
    el.style.zIndex = "10";
    document.body.appendChild(el);
  });

  await page.getByTestId("refresh-target").hover();
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("초기 컨텍스트");

  // Rewrite the dataset, re-fire pointerover for the same target with the
  // SAME relatedTarget so it hits the "visible same target re-entering"
  // path inside the provider (which copies fresh data via open()).
  await page.evaluate(() => {
    const t = document.querySelector('[data-testid="refresh-target"]') as HTMLElement;
    t.setAttribute("data-tooltip-context", "갱신된 컨텍스트");
    t.setAttribute(
      "data-tooltip-actions",
      JSON.stringify([{ action: "갱신된 액션", shortcut: "2" }]),
    );
    const ev = new PointerEvent("pointerover", {
      bubbles: true,
      relatedTarget: document.body,
      pointerType: "mouse",
    });
    Object.defineProperty(ev, "target", { value: t });
    t.dispatchEvent(ev);
  });

  // Same surface (no remount), updated content.
  await expect(tip).toContainText("갱신된 컨텍스트");
  await expect(tip).toContainText("갱신된 액션");
  await expect(tip).not.toContainText("초기 컨텍스트");
  // Still exactly one surface — no flicker through idle.
  await expect(tip).toHaveCount(1);
});

test("region On/Off — explicit show-context=false hides the context block", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-E" });
  await page.evaluate(() => {
    const el = document.createElement("button");
    el.setAttribute("data-testid", "ctxoff-target");
    el.setAttribute("data-ai-tooltip", "true");
    el.setAttribute("data-tooltip-show-context", "false");
    el.setAttribute("data-tooltip-show-actions", "true");
    el.setAttribute("data-tooltip-show-shortcuts", "false");
    el.setAttribute("data-tooltip-context", "있어도 안 보여야 함");
    el.setAttribute(
      "data-tooltip-actions",
      JSON.stringify([{ action: "다음 단계로 가기", shortcut: "→" }]),
    );
    el.style.position = "fixed";
    el.style.left = "100px";
    el.style.top = "360px";
    el.style.width = "120px";
    el.style.height = "32px";
    el.style.zIndex = "10";
    el.textContent = "ctxoff";
    document.body.appendChild(el);
  });
  await page.getByTestId("ctxoff-target").hover();
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  // Context body is suppressed.
  await expect(tip).not.toContainText("있어도 안 보여야 함");
  // Action label appears but the shortcut keycap does not (show-shortcuts=false).
  await expect(tip).toContainText("다음 단계로 가기");
  await expect(tip).not.toContainText("→");
});
