// WI-240 — C2 LIVE GATE harness: presenter broadcasts ink to a viewer.
//
// This is the automated portion of the LG-003 C2 condition. It is an EXPLICIT,
// opt-in gate — it runs only when `WEAVE_LIVE_GATE=1`, against a dev server that
// has the relay configured (VITE_WEAVE_RELAY_URL / VITE_AKU_AGENT_URL) AND a
// small-think server with the `/relay` path actually deployed (C1). Without the
// env it skips, so normal/CI runs never fail on un-deployed infra. Full
// procedure: records/launch-gates/LG-003-C2-live-gate-runbook.md
//
// NOTE: a configured `VITE_AKU_AGENT_URL` alone makes "Go live" appear, but a
// PRE-C1 server has no path routing and swallows `/relay` into the Aku handler
// (no fan-out) — so this gate genuinely fails until C1 is deployed. That is the
// point: it proves the relay path is live, not merely that the UI renders.
//
// Two PAGES in ONE context simulate presenter + viewer sharing the anonymous
// workspace (same localStorage → same design) — enough to verify the wire
// end-to-end through a real relay. Cross-DEVICE / reconnect / latency live on
// the manual checklist in the runbook.

import { expect, test } from "@playwright/test";
import { enterPresentDeck } from "./present-ink-helpers.js";

const LIVE_GATE = process.env.WEAVE_LIVE_GATE === "1";

test("C2: presenter draw broadcasts to a viewer; clear propagates", async ({ browser }) => {
  test.skip(
    !LIVE_GATE,
    "C2 live gate — set WEAVE_LIVE_GATE=1 against a relay-deployed server (see LG-003 runbook)",
  );

  const context = await browser.newContext();
  // Both tabs offline (localStorage persistence) + share the context store.
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
  });

  const presenter = await context.newPage();
  const id = await enterPresentDeck(presenter, "Live E2E");

  // With the gate on, "Go live" must be present (relay configured).
  const goLive = presenter.getByTestId("ink-go-live");
  await expect(goLive).toBeVisible();

  // Presenter goes live → a room id lands in the URL; wait for the link to open.
  await goLive.click();
  await expect(presenter).toHaveURL(/[?&]session=/);
  const room = new URL(presenter.url()).searchParams.get("session");
  expect(room).not.toBeNull();
  await expect(presenter.getByTestId("ink-live-indicator")).toContainText("Live");

  // Viewer tab joins the same room (shared localStorage → same design).
  const viewer = await context.newPage();
  await viewer.emulateMedia({ reducedMotion: "reduce" });
  await viewer.goto(`/design/${id}/present?session=${room}`);
  await expect(viewer.getByTestId("ink-viewer-chip")).toContainText("following presenter", {
    timeout: 10_000,
  });

  // Presenter draws a stroke on the active slide.
  await presenter.getByTestId("ink-toggle").click();
  const presLayer = presenter.locator('[data-ink-layer^="slide:"]');
  const box = await presLayer.boundingBox();
  if (box === null) throw new Error("presenter slide ink layer has no box");
  const cy = box.y + box.height / 2;
  await presenter.mouse.move(box.x + box.width * 0.3, cy);
  await presenter.mouse.down();
  await presenter.mouse.move(box.x + box.width * 0.6, cy, { steps: 8 });
  await presenter.mouse.up();

  // The stroke reaches the viewer over the relay and renders.
  const viewerMark = viewer.locator(
    '[data-ink-layer^="slide:"] svg path, [data-ink-layer^="slide:"] svg circle',
  );
  await expect(viewerMark).toHaveCount(1, { timeout: 5_000 });

  // Presenter clears → a sync replaces the viewer's surface (now empty).
  await presenter.getByTestId("ink-clear").click();
  await expect(viewerMark).toHaveCount(0, { timeout: 5_000 });

  await context.close();
});
