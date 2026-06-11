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
// WI-188 (DR-124) upgraded the stamp from the plain-text marker to a
// text/html ClipboardItem whose empty span carries the full serialized
// payload — external apps see nothing, and the OS clipboard doubles as a
// third transport (a fresh tab reconstructs the payload at paste time).
// WI-187 (DR-123) broadcasts marker health across tabs so a peer tab's
// successful write activates recency routing everywhere.
//
// Tests ① and ② pin the router branches with synthesized paste events
// (deterministic — no real-clipboard dependency). Test ③ closes the full
// loop with real Cmd+C / Cmd+V through Chromium's clipboard. Tests ④ and
// ⑤ pin the WI-188 fresh-tab reconstruction and the WI-187 cross-tab
// recency win, each in its own two-page context.

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

/** Read the OS clipboard's text/html flavor ("" when absent / denied). */
async function readOsClipboardHtml(page: Page): Promise<string> {
  return page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      const it = items.find((i) => i.types.includes("text/html"));
      if (it === undefined) return "";
      return await (await it.getType("text/html")).text();
    } catch {
      return "";
    }
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
  // WI-188: the stamp is now a text/html ClipboardItem (no text flavor), so
  // read the html flavor and look for the marker attribute.
  await expect
    .poll(() => readOsClipboardHtml(page), { timeout: 5000 })
    .toContain('data-weave-clipboard="v1"');

  const before = (await rootChildIds(page)).length;
  // Marker routing active → the Cmd+V keydown yields, Chromium fires the
  // native paste event with the marker text, the router dispatches internal.
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(before + 1);
});

test("④ WI-188 — copy 이후에 연 fresh 탭이 OS 클립보드 HTML 페이로드만으로 paste한다", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard permission grants are Chromium-only");
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pageA = await context.newPage();

  await clearAllDesigns(pageA);
  await prepareDesign(pageA, { flavor: "mixed", title: "WI-188-fresh-tab-A" });
  await addFrame(pageA, "shape", {
    frame: { x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await rootChildIds(pageA);
  const sourceId = ids[ids.length - 1]!;
  await select(pageA, sourceId);
  await pageA.keyboard.press("ControlOrMeta+C");
  await expect
    .poll(() => readOsClipboardHtml(pageA), { timeout: 5000 })
    .toContain("data-weave-payload=");

  // Tab B opens AFTER the copy — the BroadcastChannel broadcast already
  // happened, so its in-memory store is empty and its marker health is
  // unknown. The ONLY carrier left is the OS clipboard itself.
  const pageB = await context.newPage();
  await prepareDesign(pageB, { flavor: "mixed", title: "WI-188-fresh-tab-B" });
  const storeEmpty = await pageB.evaluate(() => {
    const w = window as unknown as { __weaveClipboardPeek?: () => unknown };
    return w.__weaveClipboardPeek?.() === undefined;
  });
  expect(storeEmpty).toBe(true);
  const beforeB = (await rootChildIds(pageB)).length;

  // Cmd+V: keydown probe sees an EMPTY store → yields → native paste fires
  // with the HTML stamp → the router adopts the embedded payload and pastes.
  await pageB.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await rootChildIds(pageB)).length).toBe(beforeB + 1);
  const idsB = await rootChildIds(pageB);
  expect(idsB[idsB.length - 1]).not.toBe(sourceId); // remapped fresh id

  await pageB.close();
  await pageA.close();
  await context.close();
});

test("⑤ WI-187 — 피어 탭의 copy가 이 탭의 recency 라우팅을 활성화한다 (이후의 OS 이미지가 이김)", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "clipboard permission grants are Chromium-only");
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pageA = await context.newPage();
  const pageB = await context.newPage(); // open BEFORE the copy → receives broadcasts

  await clearAllDesigns(pageA);
  await prepareDesign(pageA, { flavor: "mixed", title: "WI-187-health-A" });
  await prepareDesign(pageB, { flavor: "mixed", title: "WI-187-health-B" });
  await addFrame(pageA, "shape", {
    frame: { x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await rootChildIds(pageA);
  await select(pageA, ids[ids.length - 1]!);
  await pageA.keyboard.press("ControlOrMeta+C");

  // The payload reaches B via the clipboard transport AND — the WI-187
  // contract under test — A's successful marker write flips B's health.
  // Pre-WI-187, B stayed "unknown" and its keydown pasted internal-first.
  await expect
    .poll(
      () =>
        pageB.evaluate(() => {
          const w = window as unknown as {
            __weaveClipboardPeek?: () => unknown;
            __weaveMarkerRoutingActive?: () => boolean;
          };
          return (
            w.__weaveClipboardPeek?.() !== undefined && w.__weaveMarkerRoutingActive?.() === true
          );
        }),
      { timeout: 5000 },
    )
    .toBe(true);

  // Something is copied AFTER the weave copy: an OS image replaces the
  // marker stamp wholesale.
  await pageB.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d context");
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b !== null ? resolve(b) : reject(new Error("toBlob"))), "image/png");
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  });

  const beforeB = (await rootChildIds(pageB)).length;
  expect(await countImages(pageB)).toBe(0);

  // Cmd+V in B: health is ok (propagated) → keydown yields → native paste
  // carries the image with NO marker → the OS image wins. Without WI-187
  // this keydown would have pasted the transported internal shape instead.
  await pageB.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => countImages(pageB), { timeout: 5000 }).toBe(1);
  expect((await rootChildIds(pageB)).length).toBe(beforeB + 1);

  await pageB.close();
  await pageA.close();
  await context.close();
});
