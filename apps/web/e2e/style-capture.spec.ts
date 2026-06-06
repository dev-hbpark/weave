// MANUAL verification harness (NOT part of CI) — drives weave against a live
// byo-ssh agent-server to generate one design PER design style and screenshot it.
//   VITE_AKU_AGENT_URL=ws://localhost:8799 VITE_AKU_AGENT_TOKEN=verify-token \
//   STYLES="글래스모피즘" npx playwright test e2e/style-capture.spec.ts
// Screenshots → /tmp/style-shots/<style>.png ; diagnostics → /tmp/pw-style-diag.log

import { appendFileSync, mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const OUT = "/tmp/style-shots";
mkdirSync(OUT, { recursive: true });
const DIAG = "/tmp/pw-style-diag.log";
const diag = (m: string) => appendFileSync(DIAG, `${m}\n`);

const PROMPTS: Record<string, string> = {
  글래스모피즘: "AI 자산관리 서비스의 핵심 기능 3가지를 소개하는 히어로 슬라이드 한 장.",
  사이버펑크: "보안 침투 테스트 도구의 기능을 소개하는 슬라이드 한 장.",
  클레이모피즘: "어린이 코딩 교육 앱의 온보딩 환영 화면 한 장.",
  "네오 브루탈리즘": "개성 강한 디자인 스튜디오의 브랜드 소개 슬라이드 한 장.",
};

const STYLES = (process.env.STYLES ?? "글래스모피즘")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

test.describe.configure({ mode: "serial" });

// Count ALL items in the tree (the agent adds NESTED items inside slide frames, so
// root.children alone misses them).
function deepCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    type N = { children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: N } };
    const root = w.__weaveDoc?.root;
    if (root === undefined) return 0;
    let n = 0;
    const walk = (i: N) => {
      n += 1;
      for (const c of i.children ?? []) walk(c);
    };
    walk(root);
    return n;
  });
}

function connState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as { __weavePeek?: { akuConnection?: { state?: string } } };
    return w.__weavePeek?.akuConnection?.state ?? "unknown";
  });
}

for (const style of STYLES) {
  test(`generate + capture: ${style}`, async ({ page }) => {
    test.setTimeout(360_000);
    page.on("console", (m) => {
      if (m.type() === "error") diag(`[console.error] ${m.text()}`);
    });
    page.on("websocket", (ws) => {
      diag(`[ws open] ${ws.url()}`);
      ws.on("close", () => diag(`[ws CLOSE] ${ws.url()}`));
      ws.on("socketerror", (e) => diag(`[ws ERROR] ${e}`));
    });

    await clearAllDesigns(page);
    await prepareDesign(page, { flavor: "slide-deck", title: `style-${style}` });
    await page.locator("[data-aku-launcher]").click();
    await expect(page.locator("[data-aku-panel]")).toBeVisible();
    const composer = page.getByLabel("아쿠에게 메시지");
    await expect(composer).toBeVisible({ timeout: 20_000 });

    await page
      .getByTestId("aku-style-picker")
      .getByRole("button", { name: style, exact: true })
      .click();
    await composer.click();
    await composer.fill(PROMPTS[style] ?? `${style} 스타일로 소개 슬라이드 한 장.`);
    const base = await deepCount(page);
    await page.keyboard.press("Meta+Enter");

    try {
      // Wait for the agent to add content, then for the tree to settle.
      await expect
        .poll(() => deepCount(page), { timeout: 330_000, intervals: [3000] })
        .toBeGreaterThan(base);
      let last = -1;
      let stableMs = 0;
      while (stableMs < 18_000) {
        const c = await deepCount(page);
        if (c === last) stableMs += 2500;
        else {
          stableMs = 0;
          last = c;
        }
        diag(`[poll] items=${c} conn=${await connState(page)}`);
        await page.waitForTimeout(2500);
      }
    } finally {
      diag(`[final] items=${await deepCount(page)} conn=${await connState(page)}`);
      await page
        .getByLabel("아쿠 닫기")
        .click()
        .catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${style}.png` });
    }
  });
}
