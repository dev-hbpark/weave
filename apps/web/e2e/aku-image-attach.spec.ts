// WI-229 / DR-144 — Aku composer image-attachment path (regression).
//
// The image attach affordance sits in front of the composer input: pick / paste
// / drag-drop an image, see a removable thumbnail, then send. The image rides the
// AkuUserMessage `images` payload to the agent for VISION (raw bytes) + ASSET
// (uploaded URL) use. The actual server submit lives in the backend-dependent
// suite (no agent server offline, per aku-chat.spec.ts), so what this guards is
// the fully-offline half of the path:
//
//   1. the attach button is present and ordered BEFORE the input, accepting images
//   2. picking a file renders a removable thumbnail (state → preview)
//   3. multiple files accumulate
//   4. an image with NO text still enables 전송 (image-only send)
//   5. sending carries the image into the committed user message — it re-renders
//      as a thumbnail in the transcript (composer → onSend → AkuUserMessage.images
//      → MessageList ImageThumbs). This is the seam that proves the attachment
//      survives into the payload without needing the live model.
//
// Backend-free: a token is seeded so the composer renders (token gate, WI-054);
// the offline `send` commits the user message synchronously BEFORE the transport
// attempt, which `runTurn` catches (use-aku-agent.ts try/catch) — no live server.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// A real 1×1 PNG so the FileReader data-URL + <img> decode are exercised for real.
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const pngFile = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(PNG_1X1_BASE64, "base64"),
});

const composer = (page: Page) => page.getByLabel("아쿠에게 메시지");
const attachInput = (page: Page) => page.getByTestId("aku-image-input");
const thumbs = (page: Page) => page.locator("[data-aku-attachments] img");

async function openAkuWithToken(page: Page): Promise<string> {
  // Token gate (WI-054): seed BEFORE navigation so the composer (not the setup
  // view) renders. addInitScript runs before prepareDesign's goto.
  await page.addInitScript(() => {
    window.localStorage.setItem("weave.aku.token", "e2e-token");
  });
  const id = await prepareDesign(page, { flavor: "mixed", title: "Aku-Image" });
  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();
  await expect(composer(page)).toBeVisible();
  return id;
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("attach button sits in front of the input and accepts images", async ({ page }) => {
  await openAkuWithToken(page);

  const button = page.getByRole("button", { name: "이미지 첨부" });
  await expect(button).toBeVisible();

  // The hidden file input accepts images + multi-select.
  await expect(attachInput(page)).toHaveAttribute("accept", "image/*");
  await expect(attachInput(page)).toHaveAttribute("multiple", "");

  // "in front of" — the attach button is ordered before the textarea in the row.
  const bbox = await button.boundingBox();
  const tbox = await composer(page).boundingBox();
  expect(bbox).not.toBeNull();
  expect(tbox).not.toBeNull();
  expect(bbox?.x ?? 0).toBeLessThan(tbox?.x ?? 0);
});

test("picking a file renders a thumbnail that can be removed", async ({ page }) => {
  await openAkuWithToken(page);
  await expect(thumbs(page)).toHaveCount(0);

  await attachInput(page).setInputFiles(pngFile("shot.png"));
  await expect(thumbs(page)).toHaveCount(1);
  // It is the decoded data URL, not a blob/object URL.
  await expect(thumbs(page).first()).toHaveAttribute("src", /^data:image\/png/);

  await page.getByRole("button", { name: "이미지 제거" }).click();
  await expect(thumbs(page)).toHaveCount(0);
  // The attachments strip disappears entirely once empty.
  await expect(page.locator("[data-aku-attachments]")).toHaveCount(0);
});

test("multiple files accumulate as thumbnails", async ({ page }) => {
  await openAkuWithToken(page);
  await attachInput(page).setInputFiles([pngFile("a.png"), pngFile("b.png")]);
  await expect(thumbs(page)).toHaveCount(2);
});

test("an image with no text still enables 전송 (image-only send)", async ({ page }) => {
  await openAkuWithToken(page);
  const send = page.getByRole("button", { name: "전송" });

  // Empty composer → send disabled.
  await expect(send).toBeDisabled();

  await attachInput(page).setInputFiles(pngFile("only.png"));
  await expect(thumbs(page)).toHaveCount(1);
  // No text typed, but an attachment alone is a valid send.
  await expect(send).toBeEnabled();
});

test("sending carries the attached image into the committed user message", async ({ page }) => {
  const id = await openAkuWithToken(page);
  await attachInput(page).setInputFiles(pngFile("payload.png"));
  await expect(thumbs(page)).toHaveCount(1);

  await page.getByRole("button", { name: "전송" }).click();

  // Composer clears its attachment on send…
  await expect(page.locator("[data-aku-attachments]")).toHaveCount(0);
  // …and the image re-renders inside the transcript as part of the user bubble,
  // proving it flowed composer → onSend → AkuUserMessage.images → MessageList.
  const body = page.locator("[data-aku-body]");
  await expect(body.locator("img")).toHaveCount(1);
  await expect(body.locator("img").first()).toHaveAttribute("src", /^data:image\/png/);

  // The user message (with its image) is the persisted payload shape the agent
  // transport reads — assert it landed in the conversation store, image included.
  const persisted = await page.evaluate((designId) => {
    const raw = window.localStorage.getItem(`weave.aku.conversation.${designId}`);
    return raw === null ? null : (JSON.parse(raw) as Array<Record<string, unknown>>);
  }, id);
  const userMsg = persisted?.find((m) => m.role === "user");
  expect(userMsg).toBeTruthy();
  expect(Array.isArray(userMsg?.images)).toBe(true);
  expect((userMsg?.images as unknown[]).length).toBe(1);
});
