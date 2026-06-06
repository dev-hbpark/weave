// WI-052 → WI-054 — 아쿠 (Aku) panel e2e. After WI-054 the agent loop lives on
// the small-think server (reverse-MCP), so the conversational assertions ("send
// a prompt → streamed reply → real edit") now require a running agent-server +
// model and live in a separate, server-dependent suite (not run in offline CI).
//
// What stays here is everything verifiable WITHOUT the agent: the panel shell
// (launch / close / drag / resize / first-run coachmark) and the load-bearing
// runtime invariant that typing in the composer never leaks into canvas hotkeys.
// The latter seeds its fixture item via `editor.exec` directly (not via Aku) so
// it needs no backend.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const composer = (page: Page) => page.getByLabel("아쿠에게 메시지");

async function openAku(page: Page): Promise<void> {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();
}

function childCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<unknown> } } };
    return w.__weaveDoc?.root.children.length ?? 0;
  });
}

test("launcher expands the panel; close collapses it", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
  await expect(page.locator("[data-aku-panel]")).toHaveCount(0);

  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();

  await page.getByLabel("아쿠 닫기").click();
  await expect(page.locator("[data-aku-panel]")).toHaveCount(0);
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
});

test("first-run coachmark invites the first use, then stays dismissed", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  // First load: the discovery nudge is shown, anchored to the launcher.
  await expect(page.getByText("아쿠에게 맡겨보세요")).toBeVisible({ timeout: 4000 });

  await page.getByRole("button", { name: "알겠어요" }).click();
  await expect(page.getByText("아쿠에게 맡겨보세요")).toHaveCount(0);

  // Persisted (weave.coachmark.aku-intro) — silent on reload; launcher remains.
  await page.reload();
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
  await expect(page.getByText("아쿠에게 맡겨보세요")).toHaveCount(0);
});

test("launcher defaults to the top-left", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  const box = await page.locator("[data-aku-launcher]").boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? 999).toBeLessThan(200);
  expect(box?.y ?? 999).toBeLessThan(200);
});

test("panel can be dragged anywhere and the position persists", async ({ page }) => {
  await openAku(page);
  const panel = page.locator("[data-aku-panel]");
  const before = await panel.boundingBox();
  const handle = await page.locator("[data-aku-drag-handle]").boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  const hx = (handle?.x ?? 0) + (handle?.width ?? 0) / 2;
  const hy = (handle?.y ?? 0) + (handle?.height ?? 0) / 2;

  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 220, hy + 160, { steps: 10 });
  await page.mouse.up();

  const after = await panel.boundingBox();
  expect((after?.x ?? 0) - (before?.x ?? 0)).toBeGreaterThan(120);
  expect((after?.y ?? 0) - (before?.y ?? 0)).toBeGreaterThan(100);

  const geo = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("weave.aku.geometry") ?? "{}"),
  );
  expect(geo.x).toBeGreaterThan(100);
});

test("panel can be resized from the corner", async ({ page }) => {
  await openAku(page);
  const panel = page.locator("[data-aku-panel]");
  const b0 = await panel.boundingBox();
  const grip = await page.locator("[data-aku-resize]").boundingBox();
  expect(b0).not.toBeNull();
  expect(grip).not.toBeNull();
  const gx = (grip?.x ?? 0) + (grip?.width ?? 0) / 2;
  const gy = (grip?.y ?? 0) + (grip?.height ?? 0) / 2;

  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 140, gy + 110, { steps: 10 });
  await page.mouse.up();

  const b1 = await panel.boundingBox();
  expect((b1?.width ?? 0) - (b0?.width ?? 0)).toBeGreaterThan(80);
  expect((b1?.height ?? 0) - (b0?.height ?? 0)).toBeGreaterThan(60);
});

test("transcript auto-scrolls to the bottom when opened with a long history", async ({ page }) => {
  const id = await prepareDesign(page, { flavor: "mixed", title: "Aku-Scroll" });
  // Seed a token + a long persisted conversation, then reload so the panel
  // restores them at mount. This suite is backend-free — we only need the
  // transcript to RENDER (no live streaming), which `loadConversation` provides.
  await page.evaluate((designId) => {
    window.localStorage.setItem("weave.aku.token", "e2e-token");
    const msgs = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `메시지 ${i} — ${"내용 ".repeat(12)}`,
      at: 1700000000000 + i,
    }));
    window.localStorage.setItem(`weave.aku.conversation.${designId}`, JSON.stringify(msgs));
  }, id);
  await page.reload();
  // The offline-reconcile dialog can reappear after the reload — resolve it.
  const conflict = page.getByTestId("local-conflict-dialog");
  if (await conflict.isVisible().catch(() => false)) {
    await page.getByTestId("local-conflict-save").click();
    await conflict.waitFor({ state: "hidden" });
  }

  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();
  const body = page.locator("[data-aku-body]");
  await expect(body).toBeVisible();

  // Content must overflow (otherwise "scrolled to bottom" is vacuously true)…
  await expect
    .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 4000 })
    .toBeGreaterThan(40);
  // …and the transcript should sit AT the bottom (distance-to-bottom ≈ 0).
  const distanceToBottom = await body.evaluate(
    (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
  );
  expect(distanceToBottom).toBeLessThan(8);
});

test("typing in the composer does not trigger canvas hotkeys", async ({ page }) => {
  // The composer is gated behind a configured agent token (token-setup gate,
  // WI-054 / commit 6abe632): with no token the panel shows AkuTokenSetup and
  // HIDES the composer. Seed a token before navigation (addInitScript runs
  // before prepareDesign's goto, and the token is read once at hook mount) so
  // the composer renders. Without this the panel opens but the composer never
  // appears — the gate was added after this test and it wasn't migrated.
  await page.addInitScript(() => {
    window.localStorage.setItem("weave.aku.token", "e2e-token");
  });
  await openAku(page);
  // Seed a child directly via the editor (NOT via Aku — this suite is backend-free)
  // so there's something a stray Delete could remove.
  await page.evaluate(() => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.add", { kind: "text" });
  });
  await expect.poll(() => childCount(page), { timeout: 4000 }).toBeGreaterThan(0);
  const seeded = await childCount(page);

  // Type + press Backspace/Delete WHILE the composer is focused — must edit the
  // text field, never delete a canvas item.
  await composer(page).fill("지울 텍스트");
  await composer(page).press("Backspace");
  await composer(page).press("Delete");
  await expect(childCount(page)).resolves.toBe(seeded);
});

test("token gate: no token shows the setup view (composer hidden); saving reveals it", async ({
  page,
}) => {
  // No token seeded → the panel body must show AkuTokenSetup and HIDE the
  // composer (token-setup gate, WI-054 / AkuPanel hasToken branch). This is the
  // regression that left aku-chat.spec.ts:152 silently red for months — covered
  // here so a gate regression fails loudly.
  await prepareDesign(page, { flavor: "mixed", title: "Aku-Token" });
  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();

  // Gate closed: setup view shown, composer absent, save disabled until input.
  await expect(page.locator("[data-aku-token-setup]")).toBeVisible();
  await expect(composer(page)).toHaveCount(0);
  await expect(page.getByTestId("aku-token-save")).toBeDisabled();

  // Enter + save a token → gate opens: composer appears, setup view gone, and
  // the token persists to localStorage (so the next session connects normally).
  await page.getByTestId("aku-token-input").fill("e2e-token");
  await expect(page.getByTestId("aku-token-save")).toBeEnabled();
  await page.getByTestId("aku-token-save").click();

  await expect(composer(page)).toBeVisible();
  await expect(page.locator("[data-aku-token-setup]")).toHaveCount(0);
  const saved = await page.evaluate(() => window.localStorage.getItem("weave.aku.token"));
  expect(saved).toBe("e2e-token");
});

// DR-079 — the design-style picker is pure UI (no agent), so it's verifiable here:
// the catalog renders grouped + 자동, and a chip selects. The actual styled
// GENERATION is model-dependent and lives in the server-dependent suite.
test("design-style picker: grouped named styles + 자동, and a chip selects (DR-079)", async ({
  page,
}) => {
  await openAku(page);
  // Open the token gate so the composer + style picker render.
  await page.getByTestId("aku-token-input").fill("e2e-token");
  await page.getByTestId("aku-token-save").click();

  const picker = page.getByTestId("aku-style-picker");
  await expect(picker).toBeVisible();
  await expect(picker.getByText("자동 (콘텐츠 분석)")).toBeVisible();

  // All six use-case groups are labelled.
  for (const group of ["미래지향", "SaaS", "브랜드", "테크", "생산성", "친근"]) {
    await expect(picker.getByText(group, { exact: true })).toBeVisible();
  }
  // All twelve named styles are individually present.
  for (const style of [
    "글래스모피즘",
    "오로라",
    "벤토",
    "미니멀리즘",
    "네오 브루탈리즘",
    "에디토리얼",
    "다크 UI",
    "사이버펑크",
    "머티리얼",
    "카드 UI",
    "클레이모피즘",
    "3D 일러스트",
  ]) {
    await expect(picker.getByRole("button", { name: style, exact: true })).toBeVisible();
  }

  // Selecting a style marks it active (aria-pressed); re-clicking returns to 자동.
  const chip = picker.getByRole("button", { name: "사이버펑크", exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});
