// WI-223 (agocraft WI-044 / DR-057) — a CONTENT-HEAVY grid keeps its column
// count as it grows. Before the fix, adding past capacity reshaped the grid with
// a √n square heuristic, so a 3-column table dropped to 2 columns on the first
// overflow cell and morphed further (10 cells → 4 cols) — headers misaligned and
// agent-built tables often rendered "only the header". The grow path now PRESERVES
// the column count and adds ROWS only.
//
// Drives the agent's capacity-growth path by passing enforceGridCapacity:true on
// each add (the proxy stamps this for the live agent; here we set it directly).
//
// Bootstraps without networkidle (the sandbox vite never settles).

import { expect, test } from "@playwright/test";

type W = {
  __weaveEditor: { exec: (n: string, i: unknown) => unknown };
  __weaveDoc: { root: { id: string | number; children: N[] } };
};
type N = {
  id: string | number;
  attrs: { layout?: { columns?: unknown[]; rows?: unknown[] } };
  children: N[];
};

async function bootstrap(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
    window.localStorage.setItem("weave.dev.unlock-flavors", "1");
  });
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();
  await page.getByTestId("new-design-flavor-canvas-board").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();
  await page.waitForURL(/\/design\/[^/]+$/);
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveEditor?: unknown; __weaveDoc?: unknown };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined;
  });
  await page.locator('[data-design-plane="true"]').first().waitFor();
}

const exec = (page: import("@playwright/test").Page, name: string, input: unknown) =>
  page.evaluate(({ name, input }) => (window as unknown as W).__weaveEditor.exec(name, input), {
    name,
    input,
  });

const allIds = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const walk = (n: N) => {
      out.push(String(n.id));
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return out;
  });

async function addGridChild(
  page: import("@playwright/test").Page,
  containerId: string,
): Promise<void> {
  const before = (await allIds(page)).length;
  // enforceGridCapacity:true = the agent's grow-to-fit path.
  await exec(page, "weave.item.add", {
    kind: "frame",
    containerId,
    frame: { x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 },
    enforceGridCapacity: true,
  });
  await page.waitForFunction((n) => {
    const ids: string[] = [];
    const walk = (x: N) => {
      ids.push(String(x.id));
      for (const c of x.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return ids.length > n;
  }, before);
}

const gridDims = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => {
    let dims: { cols: number; rows: number } | null = null;
    const walk = (n: N) => {
      if (String(n.id) === id) {
        dims = {
          cols: n.attrs.layout?.columns?.length ?? 0,
          rows: n.attrs.layout?.rows?.length ?? 0,
        };
      }
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return dims;
  }, id);

test("a 3-column table keeps 3 columns as content grows (WI-044)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));
  // F = an explicit 3-column grid (a table), 1 row to start (capacity 3).
  const before = new Set(await allIds(page));
  await exec(page, "weave.item.add", {
    kind: "frame",
    containerId: rootId,
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.7, rotation: 0 },
  });
  await page.waitForFunction((n) => {
    const ids: string[] = [];
    const walk = (x: N) => {
      ids.push(String(x.id));
      for (const c of x.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return ids.length > n;
  }, before.size);
  const F = (await allIds(page)).find((x) => !before.has(x));
  if (F === undefined) throw new Error("no grid frame");

  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: {
      kind: "auto-grid",
      columns: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
      rows: [{ kind: "fr", value: 1 }],
      columnGap: 0,
      rowGap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  });

  // Header (3) + 7 data cells = 10 children. Old √n heuristic → ⌈√10⌉ = 4 cols.
  for (let i = 0; i < 10; i++) await addGridChild(page, F);

  const dims = await gridDims(page, F);
  expect(dims?.cols, `columns=${dims?.cols} (must stay 3, not reshape to √n=4)`).toBe(3);
  expect(dims?.rows, `rows=${dims?.rows} (⌈10/3⌉ = 4)`).toBe(4);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
