// DR-062 — per-range typography integration gate (REAL UI path).
//
// Supersedes the DR-060 `text-outline-per-range.spec.ts`, which drove the
// `__weaveActiveTextOutline` bridge directly and so never exercised the actual
// toolbar UX — the exact reason three regressions shipped:
//   ① per-range props beyond outline didn't apply,
//   ② the 더보기 popover closed the moment a per-range control bounced editor
//      focus back to the contentEditable,
//   ③ the color swatch ignored the selection (no multi/single display).
//
// This spec opens the real 더보기 popover, drives the real 외곽선 두께 control,
// and asserts the popover STAYS OPEN and the swatch reflects the selection.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addText(page: Page): Promise<string> {
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

interface Run {
  insert: string;
  attributes?: { outlineColor?: string; outlineWidth?: number; color?: string };
}

function setColorOnSelection(page: Page, hex: string): Promise<void> {
  return page.evaluate((c) => {
    (
      window as unknown as {
        __weaveActiveTextStyle?: {
          setStyleProp(k: string, v: string | number | undefined): void;
        } | null;
      }
    ).__weaveActiveTextStyle?.setStyleProp("color", c);
  }, hex);
}

async function readRuns(page: Page, id: string): Promise<Run[]> {
  return page.evaluate((tid) => {
    type Node = { id: unknown; attrs: { textRuns?: Run[] }; children: ReadonlyArray<Node> };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function find(n: Node): Node | undefined {
      if (String(n.id) === tid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    return find(w.__weaveDoc!.root)?.attrs.textRuns ?? [];
  }, id);
}

async function enterEditWithText(page: Page, text: string, color: string): Promise<string> {
  const id = await addText(page);
  expect(id).not.toBe("");
  await page.evaluate(
    ({ fid, t, c }) => {
      (
        window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } }
      ).__weaveEditor?.exec("weave.item.update", {
        itemId: fid,
        patch: (prev: { attrs: Record<string, unknown> }) => ({
          attrs: { ...prev.attrs, text: t, fontSize: 64, color: c },
        }),
      });
    },
    { fid: id, t: text, c: color },
  );
  await page.getByTestId("text-block").dblclick();
  await page.getByRole("textbox", { name: "Text content" }).waitFor();
  return id;
}

async function selectFirstChars(page: Page, n: number): Promise<void> {
  await page.keyboard.press("Home");
  for (let i = 0; i < n; i++) await page.keyboard.press("Shift+ArrowRight");
}

// ② The reported bug: applying a per-range outline closed the 더보기 popover,
//    and the property didn't land. Drive the REAL 외곽선 두께 input and assert
//    the popover survives the editor-focus bounce + only the range is outlined.
test("per-range outline applies and the 더보기 popover stays open", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "per-range-outline" });
  const id = await enterEditWithText(page, "ABCDEF", "#ffffff");

  await page.waitForTimeout(150); // let the auto-select-all on entry settle
  await selectFirstChars(page, 3); // select "ABC"

  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover).toBeVisible();
  // 외곽선 lives under the "스타일" accordion (collapsed by default).
  await page.getByTestId("text-style-group-trigger").click();

  // Apply a per-range outline width through the real control. Committing the
  // value runs an `editor.update`, which bounces DOM focus back to the
  // contentEditable — the focus path that USED to dismiss the popover.
  const widthInput = page.getByLabel("외곽선 두께 input");
  await widthInput.fill("4");
  await widthInput.press("Enter");

  // THE FIX: the popover must still be open (editor surface is dismiss-exempt).
  await expect(popover).toBeVisible();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  const runs = await readRuns(page, id);
  const outlined = runs.filter((r) => (r.attributes?.outlineWidth ?? 0) > 0);
  expect(outlined.map((r) => r.insert).join("")).toBe("ABC");
  expect(
    runs
      .filter((r) => (r.attributes?.outlineWidth ?? 0) === 0)
      .map((r) => r.insert)
      .join(""),
  ).toBe("DEF");
});

// ② (drag) The reported follow-up: the 외곽선 두께 slider "doesn't move" /
//    the menu turns off when sliding. Two distinct fix mechanisms, verified
//    here without fighting Playwright's Radix pointer-capture limitation:
//      (a) the controlled slider VALUE must track each applied step — pre-fix it
//          lagged/stuck so the thumb didn't move ("움직이지 않음");
//      (b) applying must NOT bounce focus out of the popover ("메뉴가 꺼짐").
//    Driving one onValueChange-equivalent step through the real applier proves
//    both: `aria-valuenow` follows the apply AND the popover stays open.
test("the 외곽선 두께 slider value tracks the apply and the popover stays open", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "per-range-outline-drag" });
  const id = await enterEditWithText(page, "ABCDEF", "#ffffff");
  await page.waitForTimeout(150);
  await selectFirstChars(page, 3); // "ABC"

  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover).toBeVisible();
  await page.getByTestId("text-style-group-trigger").click();

  const valueNow = () =>
    page.evaluate(() => {
      const el = document.querySelector('[role="slider"][aria-label="외곽선 두께"]');
      return el ? Number.parseFloat(el.getAttribute("aria-valuenow") ?? "0") : -1;
    });
  expect(await valueNow()).toBe(0); // off to start

  // One drag step's worth of onValueChange, through the SAME applier the slider
  // calls. The controlled value must follow (the readout refresh) and focus must
  // stay on the toolbar (skip-dom-selection), so the popover does not close.
  await page.evaluate(() => {
    (
      window as unknown as {
        __weaveActiveTextStyle?: { setOutlineWidth(w: number): void } | null;
      }
    ).__weaveActiveTextStyle?.setOutlineWidth(3);
  });
  await page.waitForTimeout(100);

  await expect(popover).toBeVisible(); // (b) menu did NOT turn off
  expect(await valueNow()).toBe(3); // (a) thumb tracked the apply, not stuck at 0

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const runs = await readRuns(page, id);
  const outlined = runs.filter((r) => (r.attributes?.outlineWidth ?? 0) > 0);
  expect(outlined.map((r) => r.insert).join("")).toBe("ABC");
});

// ③ The color swatch must reflect the SELECTION: a single color when the
//    sub-range is uniform, "mixed" (#cccccc → rgb(204,204,204)) when it spans
//    differing colors. Seed the mixed runs via the MODEL (so the editor opens
//    with "ABC" red + "DEF" base) and drive only keyboard selection — this
//    isolates the DISPLAY readout from any in-editor apply/sync timing.
test("글자색 swatch shows single color for a uniform range, mixed across colors", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "per-range-color-display" });
  const id = await addText(page);
  expect(id).not.toBe("");
  await page.evaluate((fid) => {
    (
      window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } }
    ).__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Record<string, unknown> }) => ({
        attrs: {
          ...prev.attrs,
          text: "ABCDEF",
          fontSize: 64,
          color: "#ffffff",
          // ABC carries a per-run red; DEF inherits the white base.
          textRuns: [{ insert: "ABC", attributes: { color: "#ff0000" } }, { insert: "DEF" }],
        },
      }),
    });
  }, id);
  await page.getByTestId("text-block").dblclick();
  await page.getByRole("textbox", { name: "Text content" }).waitFor();
  await page.waitForTimeout(150);

  const swatch = page.getByLabel("글자 색상");
  const bgOf = () => swatch.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);

  // Select the uniform red sub-range "ABC" → swatch shows that single color.
  await selectFirstChars(page, 3);
  await page.waitForTimeout(80);
  expect(await bgOf()).toBe("rgb(255, 0, 0)");

  // Select across "ABC" (red) + "DEF" (white base) → multi-color → mixed swatch.
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(80);
  expect(await bgOf()).toBe("rgb(204, 204, 204)");
});

// The reported follow-up: after applying to a range, COLLAPSING the selection to
// a caret (still editing) must NOT keep targeting the old range. A property
// applied with no range sets the CARET's pending style, and the NEXT typed text
// carries it — while the previously-styled range is left untouched.
test("collapsing the range applies the next property at the caret (pending style)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "per-range-caret-pending" });
  const id = await enterEditWithText(page, "ABC", "#ffffff");
  await page.waitForTimeout(150); // auto-select-all settles → "ABC" selected

  // Paint the whole "ABC" red.
  await setColorOnSelection(page, "#ff0000");
  await page.waitForTimeout(60);

  // Collapse the range to a caret at the end (the user "releases" the range).
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);

  // Apply blue with NO range → must set the caret's pending style, NOT recolor
  // the old "ABC" range.
  await setColorOnSelection(page, "#0000ff");
  await page.waitForTimeout(60);

  // Type at the caret → the new text carries the pending blue.
  await page.keyboard.type("Z");
  await page.waitForTimeout(80);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  const runs = await readRuns(page, id);
  const byText = (t: string) => runs.find((r) => r.insert === t);
  // The old range stayed red — applying blue at the caret did NOT resurrect it.
  expect(byText("ABC")?.attributes?.color).toContain("ff0000");
  // The newly typed character carries the caret's pending blue.
  expect(byText("Z")?.attributes?.color).toContain("0000ff");
});
