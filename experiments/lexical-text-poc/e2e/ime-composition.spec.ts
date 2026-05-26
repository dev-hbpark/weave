import { test, expect } from "@playwright/test";

/**
 * Korean IME composition — CDP `Input.imeSetComposition` 으로 부분 자동화.
 *
 * 한계: CDP 의 imeSetComposition 은 *raw composition string* 만 전달.
 * OS-native 한국어 IME 의 jamo 결합 (ㄱ + ㅏ + ㅁ → 감) 동작은 재현 못 함.
 * 따라서 이 spec 은 *완성된 한글 글자* 만 합성 sequence 로 전달 — 진짜 IME 의
 * mechanical 안정성 (race / cursor / mount) 만 검증.
 *
 * Production confidence 의 source 는 여전히 4-browser manual (README §수동 검증).
 *
 * 참고: chromium 에서만 동작. webkit / firefox 는 CDP IME 미지원.
 */

const KOREAN_TEXT = "안녕하세요반갑습니다";

test.describe("Korean IME composition (CDP, chromium-only partial substitute)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CDP IME chromium-only");

  test("완성된 한글 글자가 합성 sequence 로 정확히 입력", async ({ page }) => {
    await page.goto("/");
    const left = page.locator(".editor-shell").first().locator(".editor");
    await left.click();

    const cdp = await page.context().newCDPSession(page);

    for (const ch of [...KOREAN_TEXT]) {
      // 1. 합성 시작: composition 영역에 글자 1개
      await cdp.send("Input.imeSetComposition", {
        text: ch,
        selectionStart: 1,
        selectionEnd: 1,
      });
      // 2. 합성 확정 (compositionend) — text 를 빈 문자열로 두고 commitText 호출
      await cdp.send("Input.insertText", { text: ch });
    }

    await expect(left).toContainText(KOREAN_TEXT, { timeout: 3_000 });
  });

  test("합성 중 cursor 위치 변경 후 추가 입력 시 글자 누락 없음", async ({ page }) => {
    await page.goto("/");
    const left = page.locator(".editor-shell").first().locator(".editor");
    await left.click();

    const cdp = await page.context().newCDPSession(page);

    // 한국어 입력
    for (const ch of "안녕") {
      await cdp.send("Input.imeSetComposition", { text: ch, selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: ch });
    }

    // cursor 를 처음으로 이동
    await page.keyboard.press("Home");

    // 추가 입력
    for (const ch of "안녕") {
      await cdp.send("Input.imeSetComposition", { text: ch, selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: ch });
    }

    await expect(left).toContainText("안녕안녕", { timeout: 3_000 });
  });

  test("빠른 합성 (10 글자/초) 시 누락 없음", async ({ page }) => {
    await page.goto("/");
    const left = page.locator(".editor-shell").first().locator(".editor");
    await left.click();

    const cdp = await page.context().newCDPSession(page);

    for (const ch of KOREAN_TEXT) {
      await cdp.send("Input.imeSetComposition", { text: ch, selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: ch });
      await page.waitForTimeout(100); // 10 ch/sec
    }

    await expect(left).toContainText(KOREAN_TEXT, { timeout: 3_000 });
  });
});
