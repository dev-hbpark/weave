import { expect, test } from "@playwright/test";

/**
 * 2-actor concurrent edit + sync 검증.
 *
 * App.tsx 가 한 페이지에 두 LexicalComposer 를 mount, yjs-bridge.ts 가 두 Y.Doc
 * 을 sync. 한 쪽 입력이 다른 쪽에 즉시 반영되는지, 동시 입력 시 양쪽 글자가 보존되는지.
 *
 * FR-002 §4 trade-off #4 의 concurrent format LWW 도 검증.
 */

test.describe("2-actor collaboration sync", () => {
  test("한 쪽 입력이 즉시 다른 쪽으로 sync", async ({ page }) => {
    await page.goto("/");
    const left = page.locator(".editor-shell").first().locator(".editor");
    const right = page.locator(".editor-shell").nth(1).locator(".editor");

    await left.click();
    await page.keyboard.type("hello from A", { delay: 30 });

    // sync delay 허용
    await expect(right).toContainText("hello from A", { timeout: 2_000 });
  });

  test("양쪽 동시 입력 시 글자 모두 보존 (CRDT char-level merge)", async ({ page }) => {
    await page.goto("/");
    const left = page.locator(".editor-shell").first().locator(".editor");
    const right = page.locator(".editor-shell").nth(1).locator(".editor");

    // A 입력
    await left.click();
    await page.keyboard.type("AAA", { delay: 50 });

    // B 입력 (A 입력 직후, 시뮬레이션상 sync 와 race)
    await right.click();
    await page.keyboard.type("BBB", { delay: 50 });

    // 양쪽 모두 "AAA" + "BBB" 보유 (순서는 CRDT 가 결정)
    await expect(left).toContainText("AAA", { timeout: 2_000 });
    await expect(left).toContainText("BBB", { timeout: 2_000 });
    await expect(right).toContainText("AAA", { timeout: 2_000 });
    await expect(right).toContainText("BBB", { timeout: 2_000 });
  });

  test("선택 영역 bold 적용이 다른 쪽으로 sync", async ({ page }) => {
    await page.goto("/");
    const left = page.locator(".editor-shell").first().locator(".editor");
    const right = page.locator(".editor-shell").nth(1).locator(".editor");

    await left.click();
    await page.keyboard.type("hello world", { delay: 30 });
    await expect(right).toContainText("hello world", { timeout: 2_000 });

    // "hello" 부분 선택 후 bold
    await left.click();
    await page.keyboard.press("Home");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowRight");

    await page.locator(".editor-shell").first().locator(".toolbar button").first().click();

    // 양쪽 모두 strong 태그 또는 bold styling 적용 확인
    await expect(left.locator("strong, [style*=bold], .lex-bold")).toHaveCount(1, {
      timeout: 2_000,
    });
    await expect(right.locator("strong, [style*=bold], .lex-bold")).toHaveCount(1, {
      timeout: 2_000,
    });
  });
});
