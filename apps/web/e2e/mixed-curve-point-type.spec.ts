// DR-033 — a single line/poly mixes straight + curved segments via per-vertex
// corner/smooth. UX: double-click a vertex toggles its type; the handle SHAPE
// (square=corner ↔ circle=smooth) and the rendered geometry follow; Cmd+Z reverts.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const TRIANGLE = [
  { x: 0.5, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

async function addPoly(page: Page): Promise<string> {
  const id = await page.evaluate(
    ({ points }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
        __weaveDoc?: { root: { id: unknown } };
      };
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "shape",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
        attrsOverride: { shape: "poly", subAttrs: { shape: "poly", points, closed: true } },
      });
      return String(r.value);
    },
    { points: TRIANGLE },
  );
  await page.waitForTimeout(120);
  return id;
}

async function vertexSmooth(page: Page, id: string, idx: number): Promise<boolean | undefined> {
  return page.evaluate(
    ({ cid, i }) => {
      type Pt = { smooth?: boolean };
      type N = { id: unknown; attrs?: { subAttrs?: { points?: Pt[] } }; children?: N[] };
      const w = window as unknown as { __weaveDoc?: { root: { children: N[] } } };
      const find = (ns: N[]): N | undefined => {
        for (const n of ns) {
          if (String(n.id) === cid) return n;
          const hit = find(n.children ?? []);
          if (hit) return hit;
        }
        return undefined;
      };
      return find(w.__weaveDoc?.root.children ?? [])?.attrs?.subAttrs?.points?.[i]?.smooth;
    },
    { cid: id, i: idx },
  );
}

async function svgTag(page: Page, id: string): Promise<string | null> {
  return page.evaluate((cid) => {
    const frame = document.querySelector(`[data-frame-id="${CSS.escape(cid)}"]`);
    const geo = frame?.querySelector("polygon, polyline, path");
    return geo?.tagName.toLowerCase() ?? null;
  }, id);
}

test("DR-033 — double-click toggles a vertex corner↔smooth (shape + render + Cmd+Z)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "DR-033" });
  const id = await addPoly(page);
  await setSelection(page, [id]);

  const v1 = page.getByTestId("poly-vertex-1");
  await expect(v1).toBeVisible();

  // Default: all corners → square handle, <polygon> geometry, no per-vertex smooth.
  await expect(v1).toHaveAttribute("data-point-type", "corner");
  expect(await v1.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("2px");
  expect(await svgTag(page, id)).toBe("polygon");
  expect(await vertexSmooth(page, id, 1)).toBeUndefined();

  // Double-click vertex 1 → smooth: round handle, the point gains smooth=true,
  // and the geometry becomes a <path> (now mixes straight + curved).
  await v1.dblclick();
  await expect(v1).toHaveAttribute("data-point-type", "smooth");
  await expect.poll(() => v1.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("50%");
  expect(await vertexSmooth(page, id, 1)).toBe(true);
  expect(await svgTag(page, id)).toBe("path");
  // The other vertices stay corners → mixed.
  await expect(page.getByTestId("poly-vertex-0")).toHaveAttribute("data-point-type", "corner");

  // One undo reverts the toggle.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("poly-vertex-1")).toHaveAttribute("data-point-type", "corner");
  await expect.poll(() => svgTag(page, id)).toBe("polygon");
});

test("DR-033 — vertex right-click menu toggles point type", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "DR-033-menu" });
  const id = await addPoly(page);
  await setSelection(page, [id]);

  await page.getByTestId("poly-vertex-2").click({ button: "right" });
  await page.getByTestId("vtx-toggle-2").click(); // "곡선 점으로"
  await expect(page.getByTestId("poly-vertex-2")).toHaveAttribute("data-point-type", "smooth");
  expect(await vertexSmooth(page, id, 2)).toBe(true);
});
