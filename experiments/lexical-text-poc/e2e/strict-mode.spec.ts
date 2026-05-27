import { expect, test } from "@playwright/test";

/**
 * StrictMode + mount/unmount/remount 회귀 방지.
 *
 * weave 의 직전 박제 사례 ([[feedback-react-strictmode-singleton-dispose]]):
 *   useEffect cleanup 에서 dispose 호출 시 dev mode 의 mount → cleanup → mount
 *   sequence 가 두 번 일어나면서 싱글톤 영구 disable. WI-013 Phase 1 의 첫 구현 버그.
 *
 * 이 spec 은 Lexical 의 LexicalComposer useMemo 패턴이 그 위험을 회피하는지 검증.
 */

test.describe("StrictMode + remount", () => {
  test("editor 가 mount → unmount → remount 후 정상 동작", async ({ page }) => {
    await page.goto("/");

    const leftEditor = page.locator(".editor-shell").first().locator(".editor");
    const rightEditor = page.locator(".editor-shell").nth(1).locator(".editor");

    // 첫 mount — 입력 가능 확인
    await leftEditor.click();
    await page.keyboard.type("first mount", { delay: 20 });
    await expect(leftEditor).toContainText("first mount");

    // Unmount
    await page.getByRole("button", { name: /unmount editors/i }).click();
    await expect(page.locator(".editor-shell")).toHaveCount(0);

    // Remount
    await page.getByRole("button", { name: /remount editors/i }).click();
    await expect(page.locator(".editor-shell")).toHaveCount(2);

    // Re-mount 후에도 정상 입력
    const leftEditorAfter = page.locator(".editor-shell").first().locator(".editor");
    await leftEditorAfter.click();
    await page.keyboard.type("after remount", { delay: 20 });
    await expect(leftEditorAfter).toContainText("after remount");
  });

  test("StrictMode 더블 마운트 시 콘솔에 dispose-related warning 없음", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        const txt = msg.text();
        // dispose / disposed / null editor / detached 류의 회귀 시그널
        if (/dispose|disposed|detached|null editor|already destroyed/i.test(txt)) {
          consoleErrors.push(txt);
        }
      }
    });

    await page.goto("/");
    await page.waitForTimeout(500); // StrictMode 의 cleanup → re-mount 가 settle 할 시간

    expect(consoleErrors, "dispose-related console errors").toEqual([]);
  });
});
