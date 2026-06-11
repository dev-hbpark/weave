// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results
// WI-186 — OS-clipboard weave marker: paste recency contract (DR-122).
//
// The WI-185 ⑰ residual was that one internal copy shadowed OS-clipboard
// images for the rest of the session. WI-186 stamps a marker into the OS
// clipboard on copy/cut and moves paste routing to the native `paste`
// event, where marker presence is a recency oracle:
//
//   marker present → internal paste wins (the weave copy is the newest)
//   image, no marker → the OS image wins (it was copied AFTER)
//
// Tests ① and ② pin the router branches with synthesized paste events
// (deterministic — no real-clipboard dependency). Test ③ closes the full
// loop with real Cmd+C / Cmd+V through Chromium's clipboard.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function rootChildIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

/** Add one shape and return its id. */
async function setupShape(page: Page): Promise<string> {
  await prepareDesign(page, { flavor: "mixed", title: "WI-186-os-marker" });
  await addFrame(page, "shape", {
    frame: { x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await rootChildIds(page);
  return ids[ids.length - 1]!;
}

/** Synthesize a native `paste` event carrying the given text payload. */
async function synthesizeTextPaste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt }));
  }, text);
}

/** Synthesize a native `paste` event carrying an 8×8 PNG file. */
async function synthesizeImagePaste(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(0, 0, 8, 8);
    const dataUrl = canvas.toDataURL("image/png");
    const bytes = atob(dataUrl.split(",")[1]!);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const file = new File([buf], "e2e-marker-paste.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt }));
  });
}

async function countImages(page: Page): Promise<number> {
  return page.evaluate(() => {
    interface Node {
      readonly kind: string;
      readonly children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    if (doc === undefined) return 0;
    let n = 0;
    const walk = (node: Node): void => {
      if (node.kind === "image") n += 1;
      for (const c of node.children) walk(c);
    };
    walk(doc.root);
    return n;
  });
}

test("① 마커 paste 이벤트 → 내부 paste 디스패치 (router marker branch)", async ({ page }) => {
  const original = await setupShape(page);
  await select(page, original);
  await page.keyboard.press("ControlOrMeta+C");
  const before = (await rootChildIds(page)).length;

  await synthesizeTextPaste(page, "weave:clipboard:v1");

  await expect.poll(async () => (await rootChildIds(page)).length).toBe(before + 1);
  const ids = await rootChildIds(page);
  expect(ids[ids.length - 1]).not.toBe(original);
});

test("② 내부 copy 이후의 OS 이미지(마커 없음)가 이긴다 — WI-185 잔여 해소", async ({ page }) => {
  const original = await setupShape(page);
  await select(page, original);
  // Internal copy — pre-WI-186 this shadowed OS images for the session.
  await page.keyboard.press("ControlOrMeta+C");
  const childrenBefore = (await rootChildIds(page)).length;
  expect(await countImages(page)).toBe(0);

  // An image WITHOUT the marker = something was copied after the weave copy.
  await synthesizeImagePaste(page);

  await expect.poll(() => countImages(page), { timeout: 5000 }).toBe(1);
  // The internal shape was NOT pasted — only the image landed.
  const childrenAfter = (await rootChildIds(page)).length;
  expect(childrenAfter).toBe(childrenBefore + 1);
});

test("③ 실제 Cmd+C가 OS 클립보드에 마커를 기록하고 Cmd+V가 내부 paste로 라우팅된다", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard permission grants are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const original = await setupShape(page);
  await select(page, original);
  await page.keyboard.press("ControlOrMeta+C");

  // The marker write is fire-and-forget — poll the REAL OS clipboard until
  // it lands. This is the half that the synthesized tests cannot cover.
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText().catch(() => "")), {
      timeout: 5000,
    })
    .toBe("weave:clipboard:v1");

  const before = (await rootChildIds(page)).length;
  // Marker routing active → the Cmd+V keydown yields, Chromium fires the
  // native paste event with the marker text, the router dispatches internal.
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(before + 1);
});
