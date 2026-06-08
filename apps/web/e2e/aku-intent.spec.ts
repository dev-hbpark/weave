// WI-148 — 아쿠 의도 기반 라우팅 e2e (Phase 1, intentSource: "client").
//
// The CLASSIFICATION + task augmentation is unit-tested (agent/intent/*.test.ts);
// here we cover the UI surfaces that DON'T need a live agent-server:
//  • the 의도 인식 위치 setting (server / client / off) + 의도 칩 표시 toggle,
//  • the explicit-intent slash commands → pending-intent chip in the composer,
//  • the correctable intent chip rendering from a persisted transcript.
// The full "send → classified chip → correction re-runs" loop needs a running
// agent-server + model and lives in the server-dependent suite (not offline CI).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const composer = (page: Page) => page.getByLabel("아쿠에게 메시지");

/** Seed the token so the composer (token-gated) renders, then open the panel. */
async function openAkuWithToken(page: Page): Promise<void> {
  const id = await prepareDesign(page, { flavor: "mixed", title: "Aku-Intent" });
  await page.evaluate(() => window.localStorage.setItem("weave.aku.token", "e2e-token"));
  await page.reload();
  const conflict = page.getByTestId("local-conflict-dialog");
  if (await conflict.isVisible().catch(() => false)) {
    await page.getByTestId("local-conflict-save").click();
    await conflict.waitFor({ state: "hidden" });
  }
  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();
  void id;
}

test("settings expose the intent-source control + chip toggle", async ({ page }) => {
  await openAkuWithToken(page);
  await page.getByTestId("aku-settings-toggle").click();
  const panel = page.getByTestId("aku-settings-panel");
  await expect(panel).toBeVisible();

  // The 3-mode segmented control + its three options.
  const source = page.getByTestId("aku-intent-source");
  await expect(source).toBeVisible();
  await expect(source.getByRole("button", { name: "클라이언트" })).toBeVisible();
  await expect(source.getByRole("button", { name: "서버" })).toBeVisible();
  await expect(source.getByRole("button", { name: "끔" })).toBeVisible();

  // Default is "클라이언트" (Phase 1). Switching to 서버 toggles the pressed state.
  await expect(source.getByRole("button", { name: "클라이언트" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await source.getByRole("button", { name: "서버" }).click();
  await expect(source.getByRole("button", { name: "서버" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The correctable-chip toggle is present.
  await expect(page.getByLabel("의도 칩 표시")).toBeVisible();
});

test("a slash command sets an explicit intent chip on the composer", async ({ page }) => {
  await openAkuWithToken(page);
  await composer(page).click();
  await composer(page).fill("/수정");

  // The intent slash command surfaces; selecting it tags the next send.
  const option = page.locator("[data-aku-slash-option='i-edit']");
  await expect(option).toBeVisible();
  await option.click();

  const pending = page.getByTestId("aku-pending-intent");
  await expect(pending).toBeVisible();
  await expect(pending).toContainText("수정");

  // The slash text is consumed (the composer is cleared for the real request).
  await expect(composer(page)).toHaveValue("");

  // Removing the chip clears the explicit intent.
  await page.getByLabel("지정한 의도 제거").click();
  await expect(page.getByTestId("aku-pending-intent")).toHaveCount(0);
});

test("the intent chip renders on a turn and opens correction options", async ({ page }) => {
  const id = await prepareDesign(page, { flavor: "mixed", title: "Aku-IntentChip" });
  // Seed a transcript whose last assistant turn carries a routed intent — the chip
  // renders from persisted state with no live agent.
  await page.evaluate((designId) => {
    window.localStorage.setItem("weave.aku.token", "e2e-token");
    const msgs = [
      { role: "user", text: "이 제목 더 크게", at: 1700000000000 },
      {
        role: "assistant",
        text: "완료했어요.",
        at: 1700000000001,
        intent: { operation: "edit", target: "selected", tonePolicy: "inherit" },
      },
    ];
    window.localStorage.setItem(`weave.aku.conversation.${designId}`, JSON.stringify(msgs));
  }, id);
  await page.reload();
  const conflict = page.getByTestId("local-conflict-dialog");
  if (await conflict.isVisible().catch(() => false)) {
    await page.getByTestId("local-conflict-save").click();
    await conflict.waitFor({ state: "hidden" });
  }
  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();

  const chip = page.getByTestId("aku-intent-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("수정");

  // The latest, settled turn's chip is editable — opening it lists the operations.
  await chip.click();
  const options = page.getByTestId("aku-intent-options");
  await expect(options).toBeVisible();
  await expect(options.locator("[data-aku-intent-option='recolor']")).toBeVisible();
});
