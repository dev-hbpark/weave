// LG-001 R4 deferred specs (safety net) — WI-029 Phase R4 left four
// e2e cases tagged "별도 PR" because they need Lexical-in-playwright
// integration or features that aren't yet live. This file picks them
// up as a safety-net suite. They are NOT v1 launch blockers — the user-
// visible behaviour they target is already exercised by the six R4
// specs that landed earlier (corner-resize / 8-handle Fixed / Auto-W
// no-handles / V-Align / Decoration / Hyperlink / Truncate). What we
// add here are the deeper regression hooks:
//
//   1. Korean IME — composition events do not lose / corrupt characters.
//   2. Cmd+B / Cmd+I / Cmd+U — range-style formatting writes through
//      Lexical's RichTextPlugin into the textRuns attribute (round-trips).
//   3. Mount / unmount / remount — entering and leaving edit mode many
//      times does not leak Lexical state or corrupt the textRuns shape.
//   4. 2-actor concurrent — WI-028 sync subsystem is currently paused
//      (SYNC_ENABLED=false), so this scenario stays test.skip with a
//      pointer to where to flip it back on when sync resumes.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addTextViaMenu(page: Page): Promise<string> {
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}

async function readTextAttrs(
  page: Page,
  itemId: string,
): Promise<{ text: string | undefined; textRuns: ReadonlyArray<unknown> | undefined }> {
  return page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; attrs: Record<string, unknown> }>;
        };
      };
    };
    const item = w.__weaveDoc?.root.children.find((c) => String(c.id) === id);
    if (item === undefined) return { text: undefined, textRuns: undefined };
    const attrs = item.attrs as { text?: string; textRuns?: ReadonlyArray<unknown> };
    return { text: attrs.text, textRuns: attrs.textRuns };
  }, itemId);
}

async function enterEditMode(page: Page): Promise<void> {
  await page.getByTestId("text-block").dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.waitFor();
  await editable.focus();
}

async function blurEditor(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(80);
}

// ── 1. Korean IME ───────────────────────────────────────────────────────
//
// Real Korean IME (Hangul) goes through three event phases per syllable:
//   compositionstart → compositionupdate (partial jamo) → compositionend
// During composition `keydown.key === "Process"`, so the hotkey path
// already filters out. The risk is in the contenteditable retaining the
// composed character correctly after `compositionend`.

test("Korean character (Hangul) commits into textRuns via Lexical input pipeline", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "R4-IME" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");

  await enterEditMode(page);
  const editable = page.getByRole("textbox", { name: "Text content" });
  // Sanity: Lexical's contenteditable is the active editor.
  await expect(editable).toBeVisible();

  // Replace the default text. `insertText` produces a real `input` event
  // with `inputType: "insertText"` + `data: "<chars>"` — the same shape
  // Chromium emits at the end of an IME composition (after compositionend)
  // for Hangul, Japanese, and Chinese. This is the path that ACTUALLY
  // commits into Lexical's editor state; the composition-* sequence
  // is just the in-progress hint and is already covered by
  // clipboard-rich-text.spec.ts's hotkey-gate test.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("안녕하세요");
  await page.waitForTimeout(120);
  await blurEditor(page);

  const attrs = await readTextAttrs(page, textId);
  expect(
    attrs.text ?? "",
    `text=${JSON.stringify(attrs.text)} textRuns=${JSON.stringify(attrs.textRuns)}`,
  ).toContain("안녕하세요");
});

// ── 2. Cmd+B / Cmd+I / Cmd+U range style ───────────────────────────────
//
// Lexical's RichTextPlugin maps Mod+B/I/U to FORMAT_TEXT_COMMAND inside
// the editor. The bridge in TextBlock.tsx converts Lexical's format
// bitmask into PartialTextStyle entries on each textRun. This spec
// proves the keyboard → textRuns round-trip.

// Lexical's keyboard command pipeline (FORMAT_TEXT_COMMAND fired via Mod+B
// / Mod+I / Mod+U) is dispatched via a `beforeinput` event with
// `inputType="formatBold"` on a real browser. Playwright's
// `keyboard.press("ControlOrMeta+B")` synthesises a `keydown` but does
// NOT emit the matching `beforeinput`, so Lexical's RichTextPlugin sees
// the keyboard event but the format command never runs. This is a known
// Playwright + Lexical interaction gotcha; the three tests below stay
// `test.fixme` with the resume condition pinned. The user-visible
// behaviour itself is verified manually + via the "rich text per-range"
// PropertiesPanel control set, which exercises the same internal
// FORMAT_TEXT_COMMAND through a different (mouse-click) trigger.
test.fixme("Cmd+B inside Lexical formats the selected range and persists into textRuns", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "R4-bold" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");

  await enterEditMode(page);
  const editable = page.getByRole("textbox", { name: "Text content" });

  // Replace the default text with a known string we can format.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("hello world");
  await page.waitForTimeout(80);

  // Select everything and bold it.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+B");
  await page.waitForTimeout(80);
  await blurEditor(page);

  const attrs = await readTextAttrs(page, textId);
  // textRuns becomes the canonical text shape post-Phase 1.5. At least
  // one run carries the bold attribute now.
  const runs = attrs.textRuns ?? [];
  const anyBold = runs.some((r) => {
    const run = r as { insert?: string; attributes?: { fontWeight?: string } };
    return run.attributes?.fontWeight === "bold";
  });
  // Lexical's keyboard handlers can race the playwright keypress timing;
  // we accept either outcome but log when the formatting failed so the
  // CI surfaces the regression direction. The spec is a safety-net gate,
  // not a strict UX gate.
  if (!anyBold) {
    console.log(`[R4-bold] textRuns lacks fontWeight=bold after Cmd+B: ${JSON.stringify(runs)}`);
  }
  expect(anyBold).toBe(true);
  expect(editable).toBeDefined(); // keep reference live; lint pleaser
});

// See the test.fixme rationale above the Cmd+B block.
test.fixme("Cmd+I formats the selected range as italic", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "R4-italic" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");

  await enterEditMode(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("italic test");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+I");
  await page.waitForTimeout(80);
  await blurEditor(page);

  const attrs = await readTextAttrs(page, textId);
  const runs = attrs.textRuns ?? [];
  const anyItalic = runs.some((r) => {
    const run = r as { attributes?: { fontStyle?: string } };
    return run.attributes?.fontStyle === "italic";
  });
  if (!anyItalic) {
    console.log(`[R4-italic] textRuns lacks fontStyle=italic: ${JSON.stringify(runs)}`);
  }
  expect(anyItalic).toBe(true);
});

// See the test.fixme rationale above the Cmd+B block.
test.fixme("Cmd+U formats the selected range with underline", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "R4-underline" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");

  await enterEditMode(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("underline test");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+U");
  await page.waitForTimeout(80);
  await blurEditor(page);

  const attrs = await readTextAttrs(page, textId);
  const runs = attrs.textRuns ?? [];
  const anyUnderline = runs.some((r) => {
    const run = r as { attributes?: { textDecoration?: string } };
    return run.attributes?.textDecoration === "UNDERLINE";
  });
  if (!anyUnderline) {
    console.log(`[R4-underline] textRuns lacks textDecoration=UNDERLINE: ${JSON.stringify(runs)}`);
  }
  expect(anyUnderline).toBe(true);
});

// ── 3. Mount / unmount / remount cycle ─────────────────────────────────
//
// Entering and leaving edit mode several times exercises Lexical's
// mount / unmount / remount lifecycle. Without proper cleanup the
// previous editor's textRuns can leak into the new mount (state shared
// between editor instances, dangling event listeners, etc.). This spec
// proves the lifecycle is clean by:
//   - typing in the first mount,
//   - leaving + re-entering (forces unmount + remount),
//   - asserting the textRuns reflect the typing AND the second mount
//     can still type new content without inheriting stale state.

test("mount → unmount → remount preserves textRuns and accepts new input", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "R4-mount" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");

  // First edit pass.
  await enterEditMode(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("first");
  await page.waitForTimeout(80);
  await blurEditor(page);

  const firstAttrs = await readTextAttrs(page, textId);
  expect(firstAttrs.text ?? "").toContain("first");

  // Second edit pass — must unmount the previous Lexical instance and
  // mount a new one without dragging the previous state.
  await enterEditMode(page);
  await page.keyboard.press("End");
  await page.keyboard.type(" second");
  await page.waitForTimeout(80);
  await blurEditor(page);

  const secondAttrs = await readTextAttrs(page, textId);
  expect(secondAttrs.text ?? "").toContain("first");
  expect(secondAttrs.text ?? "").toContain("second");

  // Third pass — yet another remount cycle. Asserting the editor still
  // accepts new input is the canary for "Lexical's command listeners
  // didn't double-register".
  await enterEditMode(page);
  await page.keyboard.press("End");
  await page.keyboard.type(" third");
  await page.waitForTimeout(80);
  await blurEditor(page);

  const thirdAttrs = await readTextAttrs(page, textId);
  expect(thirdAttrs.text ?? "").toContain("third");
});

// ── 4. 2-actor concurrent ──────────────────────────────────────────────
//
// WI-028 (CRDT sync subsystem) is currently PAUSED — `SYNC_ENABLED` is
// false in `apps/web/src/pages/DesignPage.tsx`. A real two-actor test
// would need two playwright contexts, a relay between them, and the
// SyncEngine wired up on both. Until WI-028 resumes, this scenario stays
// skipped with the resume-condition pinned so re-enabling is a one-line
// change here when the flag flips.

test.skip("[WI-028 sync paused] two playwright contexts converge under concurrent text edits", () => {
  // Re-enable when SYNC_ENABLED is flipped to true. The expected
  // shape: open two browserContexts, both load /design/:id, both
  // enter edit mode, type interleaving characters, then assert each
  // context's __weaveDoc.root.children[0].attrs.text equals.
});
